module WritePay::ArticleManagement {
    use aptos_framework::coin;
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_framework::account;
    use aptos_framework::event;
    use aptos_framework::timestamp;
    use std::signer;
    use std::string::String;
    use aptos_std::table::{Self, Table};
    use aptos_std::smart_vector::{Self, SmartVector};

    /// Struct representing a published article
    struct Article has store, drop, copy {
        author: address,
        title: String,
        excerpt: String,
        price: u64,
        shelby_blob_id: String,
        created_at: u64,
    }

    /// Global storage for articles published by an author
    struct PlatformState has key {
        articles: Table<String, Article>, // Maps shelby_blob_id to Article details
        article_published_events: event::EventHandle<ArticlePublishedEvent>,
        article_purchased_events: event::EventHandle<ArticlePurchasedEvent>,
        article_deleted_events: event::EventHandle<ArticleDeletedEvent>,
        treasury_address: address, // Address where the 10% fee goes
    }

    /// Global storage for user identity and profiles
    struct ProfileRegistry has key {
        profiles: Table<address, UserProfile>,
        profile_updated_events: event::EventHandle<ProfileUpdatedEvent>,
    }

    /// Global storage for the social graph
    struct FollowRegistry has key {
        followers: Table<address, SmartVector<address>>, // Author -> List of Follower addresses
        followed_events: event::EventHandle<FollowedEvent>,
    }

    /// Struct representing a user's on-chain identity
    struct UserProfile has store, drop, copy {
        username: String,
        bio: String,
        avatar_url: String, // Likely an IPFS/Shelby link
        updated_at: u64,
    }

    /// Event emitted when a profile is created or updated
    struct ProfileUpdatedEvent has drop, store {
        user: address,
        username: String,
        timestamp: u64,
    }

    /// Event emitted when a user follows an author
    struct FollowedEvent has drop, store {
        follower: address,
        author: address,
        timestamp: u64,
    }

    /// Event emitted when a new article is published
    struct ArticlePublishedEvent has drop, store {
        author: address,
        title: String,
        excerpt: String,
        shelby_blob_id: String,
        price: u64,
        timestamp: u64,
    }

    /// Event emitted when an article is purchased
    struct ArticlePurchasedEvent has drop, store {
        reader: address,
        author: address,
        shelby_blob_id: String,
        amount_paid: u64,
        timestamp: u64,
    }

    /// Event emitted when an article is deleted
    struct ArticleDeletedEvent has drop, store {
        author: address,
        shelby_blob_id: String,
        timestamp: u64,
    }

    /// Error codes
    const E_NOT_AUTHORIZED: u64 = 1;
    const E_ARTICLE_ALREADY_EXISTS: u64 = 2;
    const E_ARTICLE_NOT_FOUND: u64 = 3;
    const E_INSUFFICIENT_PAYMENT: u64 = 4;

    /// Initializes the platform state
    public entry fun initialize(admin: &signer, treasury: address) {
        let admin_addr = signer::address_of(admin);
        assert!(admin_addr == @WritePay, E_NOT_AUTHORIZED);

        move_to(admin, PlatformState {
            articles: table::new(),
            article_published_events: account::new_event_handle<ArticlePublishedEvent>(admin),
            article_purchased_events: account::new_event_handle<ArticlePurchasedEvent>(admin),
            article_deleted_events: account::new_event_handle<ArticleDeletedEvent>(admin),
            treasury_address: treasury,
        });

        // Initialize Identity Layer
        move_to(admin, ProfileRegistry {
            profiles: table::new(),
            profile_updated_events: account::new_event_handle<ProfileUpdatedEvent>(admin),
        });

        // Initialize Social Layer
        move_to(admin, FollowRegistry {
            followers: table::new(),
            followed_events: account::new_event_handle<FollowedEvent>(admin),
        });
    }

    /// Safely initializes V2 features for an already deployed contract
    public entry fun initialize_v2(admin: &signer) {
        let admin_addr = signer::address_of(admin);
        assert!(admin_addr == @WritePay, E_NOT_AUTHORIZED);

        if (!exists<ProfileRegistry>(admin_addr)) {
            move_to(admin, ProfileRegistry {
                profiles: table::new(),
                profile_updated_events: account::new_event_handle<ProfileUpdatedEvent>(admin),
            });
        };

        if (!exists<FollowRegistry>(admin_addr)) {
            move_to(admin, FollowRegistry {
                followers: table::new(),
                followed_events: account::new_event_handle<FollowedEvent>(admin),
            });
        };
    }

    /// Publishes a new article
    public entry fun publish_article(
        author: &signer,
        shelby_blob_id: String,
        title: String,
        excerpt: String,
        price: u64
    ) acquires PlatformState {
        let author_addr = signer::address_of(author);
        let state = borrow_global_mut<PlatformState>(@WritePay);

        assert!(!table::contains(&state.articles, shelby_blob_id), E_ARTICLE_ALREADY_EXISTS);

        let new_article = Article {
            author: author_addr,
            title,
            excerpt,
            price,
            shelby_blob_id: shelby_blob_id,
            created_at: timestamp::now_microseconds(),
        };

        table::add(&mut state.articles, shelby_blob_id, new_article);

        event::emit_event(&mut state.article_published_events, ArticlePublishedEvent {
            author: author_addr,
            title,
            excerpt,
            shelby_blob_id: shelby_blob_id,
            price,
            timestamp: timestamp::now_microseconds(),
        });
    }

    /// Purchases an article. 90% goes to author, 10% to treasury.
    public entry fun purchase_article(
        reader: &signer,
        shelby_blob_id: String,
        expected_price: u64
    ) acquires PlatformState {
        let reader_addr = signer::address_of(reader);
        let state = borrow_global_mut<PlatformState>(@WritePay);

        assert!(table::contains(&state.articles, shelby_blob_id), E_ARTICLE_NOT_FOUND);
        
        // This is safe because we just checked `contains`
        let article = table::borrow(&state.articles, shelby_blob_id);
        
        assert!(article.price == expected_price, E_INSUFFICIENT_PAYMENT);

        // Calculate split (90% author, 10% treasury)
        let treasury_fee = (article.price * 10) / 100;
        let author_amount = article.price - treasury_fee;

        // Perform transfers
        coin::transfer<AptosCoin>(reader, article.author, author_amount);
        if (treasury_fee > 0) {
            coin::transfer<AptosCoin>(reader, state.treasury_address, treasury_fee);
        };

        // Emit purchase event
        event::emit_event(&mut state.article_purchased_events, ArticlePurchasedEvent {
            reader: reader_addr,
            author: article.author,
            shelby_blob_id: shelby_blob_id,
            amount_paid: article.price,
            timestamp: timestamp::now_microseconds(),
        });
    }

    /// Deletes an article. Only the original author can delete.
    public entry fun delete_article(
        author: &signer,
        shelby_blob_id: String
    ) acquires PlatformState {
        let author_addr = signer::address_of(author);
        let state = borrow_global_mut<PlatformState>(@WritePay);

        assert!(table::contains(&state.articles, shelby_blob_id), E_ARTICLE_NOT_FOUND);

        let article = table::borrow(&state.articles, shelby_blob_id);
        assert!(article.author == author_addr, E_NOT_AUTHORIZED);

        table::remove(&mut state.articles, shelby_blob_id);

        event::emit_event(&mut state.article_deleted_events, ArticleDeletedEvent {
            author: author_addr,
            shelby_blob_id: shelby_blob_id,
            timestamp: timestamp::now_microseconds(),
        });
    }

    // ==========================================
    // IDENTITY & SOCIAL FUNCTIONS
    // ==========================================

    /// Creates or updates a user profile
    public entry fun update_profile(
        user: &signer,
        username: String,
        bio: String,
        avatar_url: String
    ) acquires ProfileRegistry {
        let user_addr = signer::address_of(user);
        let registry = borrow_global_mut<ProfileRegistry>(@WritePay);

        let profile = UserProfile {
            username: username,
            bio: bio,
            avatar_url: avatar_url,
            updated_at: timestamp::now_microseconds(),
        };

        if (table::contains(&registry.profiles, user_addr)) {
            // Update existing profile (remove old, add new to bypass lack of mutable reference for strings if we want to overwrite entirely easily)
            let existing_profile = table::borrow_mut(&mut registry.profiles, user_addr);
            existing_profile.username = profile.username;
            existing_profile.bio = profile.bio;
            existing_profile.avatar_url = profile.avatar_url;
            existing_profile.updated_at = profile.updated_at;
        } else {
            // Create new profile
            table::add(&mut registry.profiles, user_addr, profile);
        };

        event::emit_event(&mut registry.profile_updated_events, ProfileUpdatedEvent {
            user: user_addr,
            username: username,
            timestamp: timestamp::now_microseconds(),
        });
    }

    /// Follow an author
    public entry fun follow_author(
        follower: &signer,
        author_to_follow: address
    ) acquires FollowRegistry {
        let follower_addr = signer::address_of(follower);
        let registry = borrow_global_mut<FollowRegistry>(@WritePay);

        // Can't follow yourself
        assert!(follower_addr != author_to_follow, E_NOT_AUTHORIZED);

        // Initialize follower list for the author if it doesn't exist
        if (!table::contains(&registry.followers, author_to_follow)) {
            table::add(&mut registry.followers, author_to_follow, smart_vector::new<address>());
        };

        let follower_list = table::borrow_mut(&mut registry.followers, author_to_follow);
        
        // Simple check to prevent double follows (O(N) check, could be optimized with another table but fine for V1)
        let is_following = false;
        let len = smart_vector::length(follower_list);
        let i = 0;
        while (i < len) {
            if (*smart_vector::borrow(follower_list, i) == follower_addr) {
                is_following = true;
                break
            };
            i = i + 1;
        };

        if (!is_following) {
            smart_vector::push_back(follower_list, follower_addr);

            event::emit_event(&mut registry.followed_events, FollowedEvent {
                follower: follower_addr,
                author: author_to_follow,
                timestamp: timestamp::now_microseconds(),
            });
        }
    }
}
