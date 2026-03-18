# WritePay 📖⚡️

WritePay is a high-performance decentralized pay-per-read publishing platform built on **Aptos** and **Shelby Protocol**. It empowers creators to monetize high-quality content with sub-second storage latency and secure on-chain revenue sharing.

## ✨ Features

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

## 🚀 Getting Started

### 1. Requirements
- Node.js 18+
- Aptos Wallet (e.g. Petra)

### 2. Installation
```bash
cd frontend
npm install
```

### 3. Environment Setup
Copy the example environment file and fill in your values:
```bash
cp .env.example .env.local
```
Key variables:
- `NEXT_PUBLIC_SHELBY_API_KEY`: Get from [shelby.dev](https://shelby.dev)
- `NEXT_PUBLIC_APTOS_API_KEY`: Get from [Aptos Developers](https://developers.aptoslabs.com)
- `ENCRYPTION_SECRET_KEY`: A random 32-byte hex string.

### 4. Run Development Server
```bash
npm run dev
```

## 🌐 Vercel Deployment

Deploying the WritePay frontend to Vercel is straightforward:

1. **Push to GitHub**: Upload this directory to a private or public repository.
2. **Import to Vercel**: Connect your GitHub repo to a new Vercel project.
3. **Add Environment Variables**:
   - In the Vercel Project Settings, navigate to **Environment Variables**.
   - Manually add all keys defined in `.env.example`.
   - **IMPORTANT**: Do not commit your `.env.local` file!
4. **Deploy**: Follow the Vercel build process. The app uses standard Next.js build scripts.

## 📜 Smart Contract

The Move source code for the WritePay platform can be found in the `/contracts` directory. 
- **Module**: `WritePay::ArticleManagement`
- **Logic**: Handles article registration, purchase verification, profile management, and social graph.

---

Built with ❤️ for the decentralized web.
