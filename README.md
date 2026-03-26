# WritePay ⚡

**Decentralized pay-per-read publishing platform — Built on [Shelby Protocol](https://shelby.xyz)**

## The Problem

Content creators are trapped. Centralized platforms take massive cuts, control distribution, and can de-platform authors overnight. Subscription fatigue means readers won't pay for yet another monthly plan just to read one article.

There is no standard way to:
- Let readers pay **per-article** without subscriptions
- Store content in a way that **can't be censored or taken down**
- Give creators **instant, transparent revenue** without middlemen

## The Solution

WritePay lets authors publish encrypted content to decentralized storage and set their own price. Readers pay directly on-chain — 90% goes to the author instantly, 10% maintains the network. No middlemen, no de-platforming, no subscription walls.

Every article is encrypted with AES-256-GCM, stored on [Shelby Protocol](https://shelby.xyz), and registered on [Aptos](https://aptos.dev) with its price. Payment verification and key release happen automatically.

## How It Works

```
┌──────────────────────────────────────────────────────────────────────┐
│                       WRITEPAY DATA FLOW                             │
│                                                                      │
│   1. MODERATE (AI)        2. PUBLISH              3. READ            │
│   ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐│
│   │ Writer submits  │     │ Encrypt via KMS │     │ Pay on Aptos    ││
│   │ article        ───▶   │ + Upload to     │──▶  │ (one click)     ││
│   │                 │     │   Shelby        │     │                 ││
│   │ + GenLayer AI   │     │ + Register on   │     │ + 90% → Author  ││
│   │   validators    │     │   Aptos chain   │     │ + 10% → Network ││
│   │   approve safe  │     │                 │     │ + Decrypt key   ││
│   │   content       │     │                 │     │   released      ││
│   └─────────────────┘     └─────────────────┘     └─────────────────┘│
└──────────────────────────────────────────────────────────────────────┘
```

## Core Features

### 🤖 AI Moderation — GenLayer Intelligent Contracts
Before publishing, all content is routed through the **GenLayer network**. Decentralized AI validators reach consensus on the content's safety based on platform guidelines. Inappropriate content (hate speech, spam, violence) is automatically blocked before it ever touches the blockchain.

### 📖 Publish — Encrypted Content Storage
Write articles in a rich text editor. After passing AI moderation, content is encrypted client-side with AES-256-GCM and uploaded to Shelby Protocol. Metadata (title, excerpt, price) is registered on-chain.

### 💰 Commerce — Direct On-Chain Payments
Readers pay the exact price set by the author. The Aptos smart contract enforces a 90/10 split — 90% to the creator, 10% network maintenance fee. No intermediaries.

### 🔐 Access Control — Server-Side Key Management
Decryption keys are managed by a server-side KMS. Keys are only released after cryptographic verification of an Aptos purchase transaction.

### 👤 Identity — On-Chain Profiles
Persistent usernames, bios, and avatars stored directly on the Aptos blockchain. Your identity travels with your wallet.

### 🤝 Social — Follower Graph
Follow your favorite authors. The social graph lives on-chain via `FollowedEvent` emissions, giving users full ownership of their social connections.

## Architecture

```
writepay/
├── frontend/                    # Next.js 16 (React 19, Turbopack)
│   ├── src/
│   │   ├── app/                 # Pages + API routes
│   │   │   ├── api/encryption/  # KMS — key generation & decryption
│   │   │   ├── api/moderate/    # GenLayer AI Moderation bridge
│   │   │   ├── read/            # Reader discovery feed
│   │   │   ├── write/           # Writer dashboard
│   │   │   └── profile/         # User profile & settings
│   │   ├── components/          # React components
│   │   │   ├── ReaderView       # Feed, purchase, decrypt, read
│   │   │   ├── WriterDashboard  # Rich editor, pricing, publish
│   │   │   └── ProfileSettings  # Identity, articles, followers
│   │   └── lib/
│   │       ├── aptos.ts         # Aptos SDK — publish, purchase, delete
│   │       └── shelby.ts        # Shelby SDK — upload, download blobs
│   └── .env.example             # Environment template
│
├── contracts/
│   └── sources/
│       └── writepay.move        # Aptos Move smart contract
│
└── bridge_experiment/           # Decentralized AI Moderation
    ├── genlayer-contract/       # Intelligent python contract for content safety
    └── aptos-contract/          # Aptos module to receive AI verdicts
```

**Smart Contract Functions:**

| Function | Description |
|----------|-------------|
| `publish_article` | Register article on-chain (blob ID, title, price) |
| `purchase_article` | Pay for article — enforces 90/10 split |
| `delete_article` | Author-only article removal |
| `update_profile` | Set username, bio, avatar |
| `follow_author` | On-chain social follow |

## Tech Stack

- **Frontend**: Next.js 16, React 19, Turbopack, Tailwind CSS 4
- **Blockchain**: Aptos (Move smart contracts)
- **AI Moderation**: GenLayer (Decentralized Intelligent Contracts)
- **Storage**: Shelby Protocol (decentralized high-throughput blob storage)
- **Encryption**: AES-256-GCM (client-side encrypt, server-side KMS)
- **Wallet**: Aptos Wallet Adapter (Petra, Martian, etc.)

## Security

| Layer | Mechanism |
|-------|-----------|
| Content encryption | AES-256-GCM — encrypted before upload |
| Key management | Server-side KMS — keys never exposed to client |
| Access control | On-chain purchase verification before key release |
| Storage | Shelby erasure coding (10+6 Clay Codes) |
| Payments | Aptos Move — type-safe, formally verified |

## License

[MIT](LICENSE)

---

Built on [Aptos](https://aptos.dev) & [Shelby Protocol](https://shelby.xyz)
