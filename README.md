# Canton Wallet Demo

A web application demonstrating **real DAML contract operations** on Canton Network LocalNet. This demo creates actual Instrument and Holding contracts on the Canton ledger using JSON Ledger API with JWT authentication.

**✅ FULLY OPERATIONAL** - Complete token lifecycle (mint, burn, transfer) verified working (2025-10-07)

## Features

- **Automated Wallet Creation**: One-click party allocation with automatic rights management  ✨ NEW (2025-10-13)
- **Real DAML Integration**: Creates actual contracts on Canton ledger via JSON Ledger API v1/v2
- **Cross-Participant Minting**: Issue and Accept tokens across different participants
- **Two-Step Minting Flow**:
  - Step 1: Issue choice creates HoldingProposal (proposal to mint)
  - Step 2: Accept choice creates Holding (actual token balance)
- **Immediate Token Burning**: ProposeBurn choice archives Holding immediately (one-step process)
- **Multi-Token Support**: Create and manage multiple token types with dropdown selector
- **Balance Queries**: Real-time balance display with breakdown by token symbol
- **Proposal Management**: View and accept pending HoldingProposals
- **Token Transfer**: Transfer holdings between parties

## Prerequisites

- Node.js (v18 or higher)
- A running Canton Network LocalNet instance from cn-quickstart, in **shared-secret** auth mode.
  The demo signs its ledger tokens with the LocalNet shared secret (`unsafe`), which the
  default OAuth2 mode rejects with `UNAUTHENTICATED`. In `cn-quickstart/quickstart`, run
  `make setup`, answer **no** to "Enable OAUTH2", then restart LocalNet.
- Canton Network services running on:
  - **App Provider**:
    - JSON API: localhost:3975
    - Admin API: localhost:3902
  - **App User**:
    - JSON API: localhost:2975
    - Admin API: localhost:2902
  - Canton Console: Available for party/user management

## Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd canton-wallet-demo
```

2. Install dependencies:

```bash
npm install
```

3. Start the backend server:

```bash
npm run server:start
```

4. Start the frontend development server:

```bash
npm run dev
```

5. Open your browser and navigate to `http://localhost:5174`

## Usage

### Quick Start

1. **Initialize**: App automatically connects to Canton Network (localhost:3975)
2. **Create Wallet**: Click "Create External Wallet", enter name (e.g., `demo-wallet-1`) → Automatic party allocation ✨ NEW
3. **Create Token**: Name, symbol, decimals → Creates Instrument contract
4. **Issue Tokens** (Step 1/2): Select token, enter amount → Creates HoldingProposal
5. **Accept Proposal** (Step 2/2): Click Accept → Creates Holding
6. **View Balance**: Real-time balance with breakdown by token symbol
7. **Burn Tokens**: Click 🔥 Burn → Holding archived immediately

### UI Sections

1. **Connection Status**: Shows Canton Network connectivity
2. **Wallet Management**: One-click wallet creation or manual party ID entry ✨ NEW
3. **Token Creation**: Create new tokens or select from existing
4. **Token Holdings**: View balance breakdown by token with burn buttons
5. **Pending Proposals**: View and accept HoldingProposals
6. **Minting**: Issue tokens (creates proposals)

### Automated vs Manual Wallet Creation

**Automated** (Recommended): Click "Create External Wallet" - backend automatically handles:
- Party allocation via JSON Ledger API
- actAs rights grant via gRPC
- readAs rights grant for cross-participant operations

**Manual** (Advanced): Use Canton console for custom setups - see [GETTING_STARTED.md](./docs/GETTING_STARTED.md) for commands.

For detailed troubleshooting, see [CONTEXT.md](./CONTEXT.md).

## Uploading DARs to Canton

**CRITICAL**: Use this proven method to upload new DAR versions to Canton participants.

### Method: grpcurl via Python Script

Create a Python script like `/tmp/upload_dar_v2.2.0.py`:

```python
import subprocess
import base64
import json

# Read DAR file
dar_path = '/path/to/your/minimal-token-autoaccept-X.Y.Z.dar'
with open(dar_path, 'rb') as f:
    dar_bytes = f.read()

# Encode to base64 for JSON
dar_b64 = base64.b64encode(dar_bytes).decode('utf-8')

# Create upload request
upload_request = {
    "dars": [
        {
            "bytes": dar_b64,
            "description": "MinimalToken vX.Y.Z - Description of changes"
        }
    ],
    "vet_all_packages": True,
    "synchronize_vetting": True
}

json_data = json.dumps(upload_request)

# Upload to app-provider (port 3902)
print("📦 Uploading DAR to app-provider...")
result = subprocess.run([
    'grpcurl', '-plaintext',
    '-d', json_data,
    'localhost:3902',
    'com.digitalasset.canton.admin.participant.v30.PackageService/UploadDar'
], capture_output=True, text=True)

if result.returncode == 0:
    print("✅ app-provider:", result.stdout.strip())
else:
    print("❌ app-provider error:", result.stderr.strip())
    exit(1)

# Upload to app-user (port 2902)
print("\n📦 Uploading DAR to app-user...")
result2 = subprocess.run([
    'grpcurl', '-plaintext',
    '-d', json_data,
    'localhost:2902',
    'com.digitalasset.canton.admin.participant.v30.PackageService/UploadDar'
], capture_output=True, text=True)

if result2.returncode == 0:
    print("✅ app-user:", result2.stdout.strip())
else:
    print("❌ app-user error:", result2.stderr.strip())
    exit(1)

print("\n✅ Upload complete!")
```

Then run:

```bash
python3 /tmp/upload_dar_v2.2.0.py
```

**Expected Output**:

```
📦 Uploading DAR to app-provider...
✅ app-provider: {
  "darIds": [
    "c90d4ebea4593e9f5bcb46291cd4ad5fef08d94cb407a02085b30d92539383ae"
  ]
}

📦 Uploading DAR to app-user...
✅ app-user: {
  "darIds": [
    "c90d4ebea4593e9f5bcb46291cd4ad5fef08d94cb407a02085b30d92539383ae"
  ]
}

✅ Upload complete!
```

### After Upload

Update package IDs in the following files:

1. `src/services/cnQuickstartLedgerService.js` (line 24):

```javascript
this.minimalTokenPackageId = 'bc5800fb102ebab939780f60725fc87c5c0f93c947969c8b2fc2bb4f87d471de'; // v2.4.0
```

2. `server/services/jsonApiV1Service.js` (line 22):

```javascript
this.packageIds = [
  'bc5800fb102ebab939780f60725fc87c5c0f93c947969c8b2fc2bb4f87d471de',  // v2.4.0
  // ... older versions if needed for backward compatibility
];
```

**Why This Method Works**:

- ✅ Uses grpcurl with Canton's PackageService gRPC API
- ✅ No Python protobuf dependencies required
- ✅ Direct participant upload (ports 3902, 2902)
- ✅ Proper vetting and synchronization
- ✅ Returns package IDs for verification

**Methods That DON'T Work**:

- ❌ `daml ledger upload-dar` (authentication errors)
- ❌ Python gRPC with Canton protobufs (missing modules)
- ❌ Canton console via piped commands (participant name issues)

## Architecture

### DAML Integration Architecture

- **JSON Ledger API**: v2 for commands, v1 for queries
- **JWT Authentication**: HMAC-SHA256 signed tokens with `scope: 'daml_ledger_api'`
- **Real Contracts**: Actual Instrument, HoldingProposal, and Holding contracts on ledger
- **DAML Finance Pattern**: Holding has both admin and owner as signatories
- **Cross-Participant**: Admin on app-provider, owners on app-user participant
- **No Mocks**: 100% real Canton ledger operations

### Tech Stack

- **Frontend**: React 19.1.1 + Vite 7.1.5
- **Backend**: Fastify server (port 8899)
- **DAML**: MinimalToken v2.4.0 contracts (with ProposeBurn/AcceptBurn pattern) ✨ NEW
- **Canton**: LocalNet from cn-quickstart
- **Package ID (v2.4.0)**: `bc5800fb102ebab939780f60725fc87c5c0f93c947969c8b2fc2bb4f87d471de` ✅ CURRENT
- **Package ID (v2.2.0)**: `c90d4ebea4593e9f5bcb46291cd4ad5fef08d94cb407a02085b30d92539383ae`
- **Package ID (v2.1.0)**: `c598823710328ed7b6b46a519df06f200a6c49de424b0005c4a6091f8667586d`
- **Package ID (v2.0.1)**: `2399d6f39edcb9611b116cfc6e5b722b65b487cbb71e13a300753e39268f3118`
- **Package ID (v2.0.0)**: `eccbf7c592fcae3e2820c25b57b4c76a434f0add06378f97a01810ec4ccda4de`

## Project Structure

```
canton-wallet-demo/
├── src/
│   ├── App.jsx                      # Main React component
│   ├── services/
│   │   └── cantonConsoleService.js  # Real Canton integration
│   ├── index.css                    # Styles
│   └── main.jsx                     # React entry point
├── server/
│   ├── index.js                     # Fastify server
│   └── routes/                      # API routes
├── daml/
│   └── minimal-token/               # DAML contracts
├── scripts/                         # Utility scripts
└── docs/
    └── PRD.md                       # Product requirements
```

## Real Canton Operations

This demo performs **actual DAML operations** on Canton ledger:

### API Integration

1. **Commands** (v2): `POST /v2/commands/submit-and-wait-for-transaction`
   - CreateCommand (Instrument)
   - ExerciseCommand (Issue, Accept)
2. **Queries** (v1): `POST /v1/query` with templateIds
   - Query Holdings by owner
   - Query HoldingProposals by owner
   - Query Instruments by admin

### DAML Contract Flow (MinimalToken v2.4.0)

```
Instrument (signatory: admin)
  ↓ Issue choice (controller: admin)
HoldingProposal (signatory: admin, observer: owner)
  ↓ Accept choice (controller: owner)
Holding (signatory: admin, owner)  ← Both sign (DAML Finance pattern)
  ↓ ProposeBurn choice (controller: owner) ✨ NEW
BurnProposal (signatory: owner, observer: admin) ✨ NEW
  ↓ AcceptBurn choice (controller: admin) ✨ NEW
Archived (both BurnProposal and Holding) ← Reduces supply
```

**Key Design Decisions:**

1. **Both Signatories**: Holding requires both admin and owner signatures (standard DAML Finance pattern)
2. **Combined Authority**: When owner exercises Accept, they gain combined authority from proposal signatory
3. **Cross-Participant**: Works because Accept choice gives owner signing rights
4. **ACS Visibility**: Both signatories ensure Holdings appear in owner's ACS queries
5. **Two-Step Burn** ✨ NEW: ProposeBurn/AcceptBurn pattern for cross-participant dual-signatory burn
   - Owner creates BurnProposal (signatory: owner, observer: admin)
   - Admin accepts to complete burn (archives both contracts)
   - Solves CONTRACT_NOT_ACTIVE error with dual signatories across participants
6. **Legacy Burn**: Direct Burn choice kept for backward compatibility (may fail cross-participant)

### Verified Test Cases

**Minting Flow** (2025-10-06):

- Token: USA Token (symbol: USA)
- Flow: Create Instrument → Issue (HoldingProposal) → Accept (Holding) ✅
- Cross-participant: app-provider (admin) → app-user (demo-wallet-1) ✅
- Balance query: Returns 1000 USA tokens ✅

**Burning Flow** (2025-10-07) ✨ NEW:

- Flow: User clicks "🔥 Burn" → ProposeBurn (BurnProposal created) ✅
- Admin sees proposal in admin panel ✅
- Admin clicks "🔥 Approve Burn" → AcceptBurn (both contracts archived) ✅
- Balance updated immediately after approval ✅
- Cross-participant burn working perfectly ✅

**No mocks, no simulations - everything is real Canton ledger data!**

## License

ISC License
