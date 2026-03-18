# WritePay 📖⚡️

WritePay is a high-performance decentralized pay-per-read publishing platform built on **Aptos** and **Shelby Protocol**. It empowers creators to monetize high-quality content with sub-second storage latency and secure on-chain revenue sharing.

## ✨ Core Features

- **Decentralized Storage**: Articles are stored as encrypted blobs on Shelby Protocol.
- **Pay-per-Article**: No monthly subscriptions. Readers pay only for what they want to read.
- **Creator Autonomy**: Authors receive 90% of revenue instantly on-chain.
- **On-Chain Profiles**: Persistent user identities and social graph (follows/followers).
- **End-to-End Encryption**: AES-256-GCM encryption ensures content privacy until purchase.

## 🛠 Tech Stack

- **Frontend**: Next.js 16 (React 19, Turbopack, Tailwind CSS 4)
- **Blockchain**: Aptos (Move Smart Contracts)
- **Storage**: @ShelbyProtocol (Decentralized high-throughput blob storage)
- **Wallet**: @Aptos-Labs Wallet Adapter (Petra, Martian, etc.)

## 📜 Smart Contract Architecture

The Move source code for the WritePay platform can be found in the `/contracts` directory. 
- **Module**: `WritePay::ArticleManagement`
- **Identity Layer**: Manages on-chain user profiles and usernames.
- **Social Layer**: Handles the follower/following graph directly on-chain.
- **Commerce Layer**: Manages content registration, price validation, and automated 90/10 revenue splitting.

## 🔒 Security & Privacy

WritePay uses a hybrid approach to security:
1. **Content**: Encrypted via AES-256-GCM before being uploaded to Shelby.
2. **Access Control**: Decryption keys are managed by a server-side KMS and only released upon verification of an Aptos purchase transaction.
3. **Storage**: Data is distributed across a decentralized network of storage providers with erasure coding (Clay Codes).

---

Built on Aptos & Shelby Protocol.
