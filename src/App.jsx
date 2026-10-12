import React, { useState, useEffect } from 'react';
import CNQuickstartFrontendService from './services/cnQuickstartFrontendService';
import storageService from './services/storageService';

// CN Quickstart integration using direct JSON Ledger API via backend
const cantonService = new CNQuickstartFrontendService();
console.log('🎯 CN Quickstart Integration: Frontend calling backend for direct JSON Ledger API');

function App() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Canton state
  const [appProviderParty, setAppProviderParty] = useState(null);

  // Wallet state
  const [wallet, setWallet] = useState(null);
  const [partyHint, setPartyHint] = useState('demo-wallet-1');
  const [manualPartyId, setManualPartyId] = useState('');
  const [showOnboardingInstructions, setShowOnboardingInstructions] = useState(false);
  
  // Token state
  const [tokenName, setTokenName] = useState('Demo Token');
  const [tokenSymbol, setTokenSymbol] = useState('DEMO');
  const [tokenDecimals, setTokenDecimals] = useState(2);
  const [createdToken, setCreatedToken] = useState(null);
  const [allTokens, setAllTokens] = useState([]); // All created tokens
  const [selectedToken, setSelectedToken] = useState(null); // Selected token for minting
  
  // Mint state
  const [mintAmount, setMintAmount] = useState(1000);
  const [tokenBalance, setTokenBalance] = useState(0);
  const [balanceBreakdown, setBalanceBreakdown] = useState([]);

  // Proposal state
  const [pendingProposal, setPendingProposal] = useState(null);
  const [allProposals, setAllProposals] = useState([]);
  const [burnProposals, setBurnProposals] = useState([]);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      setLoading(true);
      setError('');
      
      // Initialize CN Quickstart connection
      const initResult = await cantonService.initialize();
      setIsInitialized(true);
      setIsConnected(true);
      setAppProviderParty(initResult.appProviderParty);  // Save admin party

      // Load existing wallet and token data
      await loadExistingData();

      setSuccess(`Connected to CN Quickstart: ${initResult.appProviderParty}`);
    } catch (err) {
      setError(`Failed to initialize CN Quickstart: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadExistingData = async () => {
    try {
      // Load wallet from localStorage
      const savedWallet = storageService.loadWallet();
      if (savedWallet) {
        setWallet(savedWallet);
        setPartyHint(savedWallet.partyHint || 'quickstart-e-1');
        console.log('✅ Loaded existing wallet from storage');
      }

      // Load token from localStorage
      const savedToken = storageService.loadToken();
      if (savedToken) {
        setCreatedToken(savedToken);
        setSelectedToken(savedToken);
        setTokenName(savedToken.name);
        setTokenSymbol(savedToken.symbol);
        setTokenDecimals(savedToken.decimals);

        // Add to allTokens list
        setAllTokens([savedToken]);

        console.log('✅ Loaded existing token from storage');
      }

      // If we have wallet, always load the current balance (all instruments)
      if (savedWallet && savedWallet.partyId) {
        await loadTokenBalance(savedWallet.partyId, null);
        await loadProposals(savedWallet);
      }
    } catch (error) {
      console.error('❌ Failed to load existing data:', error);
    }
  };

  const loadTokenBalance = async (partyId, tokenId) => {
    try {
      const result = await cantonService.getTokenBalance(partyId, tokenId);
      if (result.success && result.holdings.length > 0) {
        const totalBalance = result.totalBalance || 0;
        setTokenBalance(totalBalance);

        // Get instrument metadata from result
        const instruments = result.instruments || {};

        // Populate allTokens from instruments (convert to token format)
        const tokensFromInstruments = Object.entries(instruments).map(([contractId, info]) => ({
          contractId,
          tokenId: contractId,
          name: info.name,
          symbol: info.symbol,
          decimals: info.decimals,
          admin: info.admin,
          isRealContract: true
        }));

        // Update allTokens (merge with existing, avoid duplicates)
        setAllTokens(prev => {
          const merged = [...prev];
          tokensFromInstruments.forEach(token => {
            const exists = merged.find(t => t.contractId === token.contractId);
            if (!exists) {
              merged.push(token);
            }
          });
          return merged;
        });

        // Group holdings by instrument for breakdown (with individual holdings for burn)
        const byInstrument = {};
        result.holdings.forEach(holding => {
          const inst = holding.instrument;
          if (!byInstrument[inst]) {
            const instrumentInfo = instruments[inst];
            byInstrument[inst] = {
              instrumentId: inst,
              amount: 0,
              count: 0,
              name: instrumentInfo?.name || 'Unknown Token',
              symbol: instrumentInfo?.symbol || '???',
              decimals: instrumentInfo?.decimals || 0,
              holdings: []  // Track individual holdings for burn
            };
          }
          byInstrument[inst].amount += holding.amount;
          byInstrument[inst].count += 1;
          byInstrument[inst].holdings.push({
            contractId: holding.contractId,
            amount: holding.amount
          });
        });

        const breakdown = Object.values(byInstrument);
        setBalanceBreakdown(breakdown);
        console.log('✅ Loaded current token balance:', totalBalance, 'across', Object.keys(byInstrument).length, 'instruments');
        console.log('📊 Balance breakdown with holdings:', JSON.stringify(breakdown, null, 2));
      } else {
        setTokenBalance(0);
        setBalanceBreakdown([]);
      }
    } catch (error) {
      console.error('❌ Failed to load token balance:', error);
      setTokenBalance(0);
      setBalanceBreakdown([]);
    }
  };

  const loadProposals = async (walletToUse) => {
    const targetWallet = walletToUse || wallet;
    if (!targetWallet || !targetWallet.partyId) {
      console.log('⚠️ No wallet available to load proposals');
      return;
    }

    try {
      setError('');
      console.log('🔄 Loading proposals for:', targetWallet.partyId);
      const result = await cantonService.getProposals(targetWallet.partyId);
      if (result.success) {
        setAllProposals(result.proposals || []);
        console.log('✅ Loaded proposals:', result.proposals?.length || 0);
      }
    } catch (error) {
      console.error('❌ Failed to load proposals:', error);
      // Don't show error to user, just log it
    }
  };

  const checkStatus = async () => {
    try {
      setLoading(true);
      setError('');
      setSuccess('');
      const status = await cantonService.getStatus();
      if (status.connected) {
        setIsConnected(true);
        setSuccess(`Connected to CN Quickstart: ${status.appProviderParty}`);
      } else {
        setIsConnected(false);
        setError('Not connected to CN Quickstart');
      }
    } catch (err) {
      setError(`Failed to check status: ${err.message}`);
      setIsConnected(false);
    } finally {
      setLoading(false);
    }
  };

  const createWallet = async () => {
    try {
      setLoading(true);
      setError('');
      setSuccess('');
      const walletInfo = await cantonService.createExternalWallet(partyHint);

      // Add party hint to wallet info
      const walletWithHint = { ...walletInfo, partyHint };

      setWallet(walletWithHint);

      // Save wallet to localStorage
      storageService.saveWallet(walletWithHint);

      setSuccess('External wallet created and saved successfully');
    } catch (err) {
      setError(`Failed to create wallet: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const useExistingParty = () => {
    if (!manualPartyId || !manualPartyId.includes('::')) {
      setError('Please enter a valid party ID (format: party-hint::fingerprint)');
      return;
    }

    const partyHintFromId = manualPartyId.split('::')[0];
    const fingerprint = manualPartyId.split('::')[1];

    const walletInfo = {
      partyId: manualPartyId,
      partyHint: partyHintFromId,
      publicKey: 'existing-party',
      fingerprint: fingerprint,
      createdAt: new Date().toISOString()
    };

    setWallet(walletInfo);
    storageService.saveWallet(walletInfo);
    setSuccess(`Using existing party: ${manualPartyId}`);
    setError('');
  };

  const createToken = async () => {
    try {
      setLoading(true);
      setError('');
      setSuccess('');

      const token = await cantonService.createToken(
        tokenName,
        tokenSymbol,
        parseInt(tokenDecimals)
      );

      setCreatedToken(token);
      setSelectedToken(token);

      // Add to allTokens list (avoid duplicates)
      setAllTokens(prev => {
        const exists = prev.find(t => t.contractId === token.contractId);
        if (exists) return prev;
        return [...prev, token];
      });

      // Save token to localStorage
      storageService.saveToken(token);

      setSuccess(`Token created successfully: ${token.contractId}`);
    } catch (err) {
      setError(`Failed to create token: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const issueTokens = async () => {
    try {
      setLoading(true);
      setError('');
      setSuccess('');

      if (!createdToken) {
        throw new Error('No token created yet');
      }

      if (!wallet) {
        throw new Error('No wallet created yet');
      }

      // Issue tokens (creates HoldingProposal)
      const result = await cantonService.mintTokens(
        createdToken.contractId,
        wallet.partyId,
        parseFloat(mintAmount)
      );

      setPendingProposal({
        proposalId: result.proposalId,
        owner: wallet.partyId,
        amount: parseFloat(mintAmount)
      });

      // Reload proposals to show the new one
      await loadProposals();

      setSuccess(`Step 1/2: HoldingProposal created! Proposal ID: ${result.proposalId.substring(0, 20)}...`);
    } catch (err) {
      setError(`Failed to issue tokens: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const acceptProposal = async () => {
    try {
      setLoading(true);
      setError('');
      setSuccess('');

      if (!pendingProposal) {
        throw new Error('No pending proposal to accept');
      }

      // Accept the proposal (creates Holding)
      const result = await cantonService.acceptProposal(
        pendingProposal.proposalId,
        pendingProposal.owner
      );

      setSuccess(`Step 2/2: SUCCESS! Tokens minted. Holding ID: ${result.holdingId.substring(0, 20)}...`);

      // Clear proposal and update balance
      setPendingProposal(null);
      await updateBalance();
    } catch (err) {
      setError(`Failed to accept proposal: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const burnHolding = async (holdingId, amount, symbol) => {
    try {
      setLoading(true);
      setError('');
      setSuccess('');

      console.log('🔥 Burning holding:', holdingId);

      // Burn immediately (ProposeBurn choice is consuming by design)
      const result = await cantonService.proposeBurnHolding(
        holdingId,
        wallet.partyId
      );

      setSuccess(`🔥 ${amount} ${symbol} tokens burned successfully!`);

      // Update balance to reflect burn
      await updateBalance();
    } catch (err) {
      setError(`Failed to burn tokens: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const transferToAdmin = async (holdingId, amount, symbol) => {
    try {
      setLoading(true);
      setError('');
      setSuccess('');

      console.log('🔄 Transferring holding back to admin:', holdingId);

      // Transfer the full amount back to admin
      const result = await cantonService.transferHolding(
        holdingId,
        wallet.partyId,
        appProviderParty,  // Transfer to admin
        amount.toString()
      );

      setSuccess(`✅ Transferred ${amount} ${symbol} tokens back to admin!`);

      // Update balance
      await updateBalance();
    } catch (err) {
      setError(`Failed to transfer tokens: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const updateBalance = async () => {
    try {
      if (!wallet) return;

      // Query ALL holdings (no instrument filter) to show total balance
      const result = await cantonService.getTokenBalance(
        wallet.partyId,
        null  // null = get all instruments
      );

      if (result.success) {
        setTokenBalance(result.totalBalance || 0);

        // Get instrument metadata from result
        const instruments = result.instruments || {};

        // Group holdings by instrument (with individual holdings for burn functionality)
        const byInstrument = {};
        result.holdings.forEach(holding => {
          const inst = holding.instrument;
          if (!byInstrument[inst]) {
            const instrumentInfo = instruments[inst];
            byInstrument[inst] = {
              instrumentId: inst,
              amount: 0,
              count: 0,
              name: instrumentInfo?.name || 'Unknown Token',
              symbol: instrumentInfo?.symbol || '???',
              decimals: instrumentInfo?.decimals || 0,
              holdings: []  // Track individual holdings for burn
            };
          }
          byInstrument[inst].amount += holding.amount;
          byInstrument[inst].count += 1;
          byInstrument[inst].holdings.push({
            contractId: holding.contractId,
            amount: holding.amount
          });
        });

        const breakdown = Object.values(byInstrument);
        setBalanceBreakdown(breakdown);
        console.log(`✅ Updated balance: ${result.totalBalance} (${result.holdingCount} holdings across ${Object.keys(byInstrument).length} instruments)`);
        console.log('📊 Balance breakdown with holdings:', JSON.stringify(breakdown, null, 2));
      } else {
        setTokenBalance(0);
        setBalanceBreakdown([]);
      }

      // Note: Burns happen immediately (ProposeBurn choice is consuming by design)
    } catch (err) {
      console.error('Failed to update balance:', err);
      setTokenBalance(0);
      setBalanceBreakdown([]);
    }
  };

  const acceptSpecificProposal = async (proposal) => {
    try {
      setLoading(true);
      setError('');
      setSuccess('');

      console.log('🔄 Accepting proposal:', proposal);

      // Accept the proposal
      const result = await cantonService.acceptProposal(
        proposal.proposalId,
        proposal.owner
      );

      console.log('✅ Proposal accepted successfully!', result);
      setSuccess(`✅ Proposal accepted! You received ${proposal.amount} tokens. Holding ID: ${result.holdingId.substring(0, 20)}...`);

      // Reload proposals and balance (pass wallet explicitly)
      await loadProposals(wallet);
      await updateBalance();

      console.log('✅ Proposals and balance updated');
    } catch (err) {
      console.error('❌ Accept proposal error:', err);
      setError(`Failed to accept proposal: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadBurnProposals = async () => {
    // Get current token from state or storage
    const currentToken = createdToken || storageService.getToken();

    if (!currentToken) {
      console.log('⚠️ Cannot load burn proposals - no token created yet');
      return;
    }

    try {
      console.log('🔄 Loading burn proposals for admin:', currentToken.admin);

      // Query burn proposals for the admin (who needs to accept them)
      const result = await cantonService.queryBurnProposals(currentToken.admin);

      console.log('✅ Burn proposals loaded:', result.proposals);
      setBurnProposals(result.proposals || []);
    } catch (err) {
      console.error('❌ Failed to load burn proposals:', err);
      // Don't set error state - this is a background operation
    }
  };

  const acceptBurnProposal = async (proposal) => {
    try {
      setLoading(true);
      setError('');
      setSuccess('');

      console.log('🔥 Accepting burn proposal:', proposal);

      // Get current token from state or storage
      const currentToken = createdToken || storageService.getToken();

      if (!currentToken) {
        throw new Error('No token found - cannot accept burn proposal');
      }

      // Accept the burn proposal (admin accepts)
      const result = await cantonService.acceptBurnProposal(
        proposal.proposalId,
        currentToken.admin
      );

      console.log('✅ Burn proposal accepted successfully!', result);
      setSuccess(`✅ Burn approved! Holding has been burned.`);

      // Wait a moment for Canton to process the archive
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Reload burn proposals and balance
      await loadBurnProposals();
      await updateBalance();

      console.log('✅ Burn proposals and balance updated');
    } catch (err) {
      console.error('❌ Accept burn proposal error:', err);
      setError(`Failed to accept burn proposal: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const clearWallet = () => {
    if (window.confirm('⚠️ Clear wallet data? This will remove your wallet from local storage but keep tokens.')) {
      storageService.clearWallet();
      setWallet(null);
      setTokenBalance(0);
      setBalanceBreakdown([]);
      setAllProposals([]);
      setPendingProposal(null);
      setPartyHint('demo-wallet-1');
      setManualPartyId('');
      setSuccess('✅ Wallet data cleared');
    }
  };

  const clearAllTokens = () => {
    if (window.confirm('⚠️ Clear all token data? This will remove all saved tokens from local storage.')) {
      storageService.clearToken();
      setCreatedToken(null);
      setSelectedToken(null);
      setAllTokens([]);
      setTokenName('');
      setTokenSymbol('');
      setTokenDecimals(2);
      setSuccess('✅ All tokens cleared');
    }
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text).then(() => {
      setSuccess(`${label} copied to clipboard`);
      setTimeout(() => setSuccess(''), 2000);
    }).catch(() => {
      setError('Failed to copy to clipboard');
    });
  };

  return (
    <div className="container">
      <div className="header">
        <h1>Canton Wallet Demo</h1>
        <p>Create an external wallet and mint tokens using CN Quickstart LocalNet</p>
        <div className="mode-indicator real">
          <span>🚀 <strong>CN QUICKSTART</strong> - Direct JSON Ledger API Integration</span>
        </div>
      </div>

      {/* Quick Start Guide */}
      <div className="card" style={{ backgroundColor: '#f0f7ff', borderLeft: '4px solid #2196F3' }}>
        <h2 style={{ marginTop: 0, color: '#1565c0' }}>📖 Quick Start Guide</h2>
        <p style={{ margin: '0 0 1rem 0', fontSize: '0.95em', lineHeight: '1.6' }}>
          This demo shows how to create real DAML contracts on Canton Network. Follow these steps:
        </p>
        <ol style={{ margin: 0, paddingLeft: '1.5rem', fontSize: '0.95em', lineHeight: '1.8' }}>
          <li><strong>Connect</strong> - Backend automatically connects to Canton LocalNet (see below)</li>
          <li><strong>Create Wallet</strong> - Click "Create External Wallet" (backend enables party + generates keys)</li>
          <li><strong>Create Token</strong> - Define your token (Instrument contract created on Canton ledger)</li>
          <li><strong>Mint Tokens</strong> - Two-step: Issue proposal → Accept (cross-participant minting)</li>
          <li><strong>View Holdings</strong> - See your token balance (queries real Canton contracts)</li>
          <li><strong>Burn Tokens</strong> - Click 🔥 Burn to immediately remove tokens (reduces supply)</li>
        </ol>
      </div>

      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      {/* CN Quickstart Initialization */}
      <div className="card">
        <h2>1. CN Quickstart Connection</h2>
        {!isInitialized ? (
          <p>Connecting to CN Quickstart LocalNet...</p>
        ) : (
          <>
            <p>✅ Connected to CN Quickstart LocalNet</p>
            {isConnected && (
              <button 
                className="button secondary" 
                onClick={checkStatus}
                disabled={loading}
              >
                Check Status
                {loading && <span className="loading"></span>}
              </button>
            )}
          </>
        )}
      </div>

      {/* Wallet Creation */}
      {isConnected && (
        <div className="card">
          <h2>2. Create or Use External Wallet</h2>

          {/* Simple Instructions */}
          <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#e3f2fd', borderRadius: '4px', borderLeft: '4px solid #2196F3' }}>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1em', color: '#1976d2' }}>
              💡 How to create a wallet
            </h3>
            <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.9em', lineHeight: '1.5' }}>
              Use the Canton console (shown below) to:
            </p>
            <ul style={{ margin: '0 0 0.5rem 0', paddingLeft: '1.5rem', fontSize: '0.9em', lineHeight: '1.6' }}>
              <li>Enable a party on the app-user participant</li>
              <li>Grant actAs rights for transactions</li>
              <li>Grant readAs rights for the admin party (cross-participant)</li>
              <li>Get your unique Party ID (format: <code>hint::fingerprint</code>)</li>
            </ul>
            <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85em', color: '#666' }}>
              💾 Paste the party ID below - it will be saved in browser localStorage.
            </p>

            <button
              onClick={() => setShowOnboardingInstructions(!showOnboardingInstructions)}
              style={{
                marginTop: '0.75rem',
                background: 'none',
                border: 'none',
                padding: '0.25rem 0',
                cursor: 'pointer',
                fontSize: '0.85em',
                color: '#1976d2',
                textDecoration: 'underline'
              }}
            >
              {showOnboardingInstructions ? '▼ Hide advanced options' : '▶ Show advanced options (manual Canton console)'}
            </button>

            {showOnboardingInstructions && (
              <div style={{
                marginTop: '0.75rem',
                padding: '0.75rem',
                backgroundColor: '#f5f5f5',
                borderRadius: '4px',
                fontSize: '0.85em'
              }}>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95em', color: '#555' }}>Manual: Using Canton Console</h4>
                <pre style={{
                  backgroundColor: '#272822',
                  color: '#f8f8f2',
                  padding: '0.5rem',
                  borderRadius: '4px',
                  overflow: 'auto',
                  fontSize: '0.8em',
                  margin: 0
                }}>{`// Connect to Canton Console (from cn-quickstart/quickstart, run \`make canton-console\`)

// In the Canton console, run:
val usr = participants.all.find(_.name == "app-user").get
val appProvider = participants.all.find(_.name == "app-provider").get

// Create your wallet with a party hint (e.g. demo-wallet-1) and get its party ID
val myWalletPartyId = usr.parties.enable("demo-wallet-1")

// Get the admin party ID (first party in the list)
val adminPartyId = appProvider.parties.list().head.party.toLf

// Grant rights to the party:
//   - actAs rights (REQUIRED for transactions!),
//   - readAs for admin party (REQUIRED for cross-participant operations)
usr.ledger_api.users.rights.grant(
  id = "ledger-api-user",
  actAs = Set(myWalletPartyId),
  readAs = Set(PartyId.tryFromProtoPrimitive(adminPartyId))
)

// Copy the full party ID from the output and paste it in "Use Existing Party ID" below:
println(myWalletPartyId.toLf)
`}</pre>
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85em', color: '#666' }}>
                  Then paste your party ID in "Use Existing Party ID" below.
                </p>
              </div>
            )}
          </div>

          {!wallet ? (
            <>
              {/* Automated Wallet Creation (NEW!) */}
              <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#e8f5e9', borderRadius: '4px', borderLeft: '4px solid #4caf50' }}>
                <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1em', color: '#2e7d32' }}>
                  ✅ Automated Wallet Creation (Recommended)
                </h3>
                <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.9em', lineHeight: '1.5' }}>
                  Click "Create External Wallet" to automatically:
                </p>
                <ul style={{ margin: '0 0 0.5rem 0', paddingLeft: '1.5rem', fontSize: '0.9em', lineHeight: '1.6' }}>
                  <li>Allocate a party on the app-user participant</li>
                  <li>Grant actAs rights for transactions</li>
                  <li>Grant readAs rights for cross-participant operations</li>
                  <li>Save your wallet to browser localStorage</li>
                </ul>

                <div className="form-group" style={{ marginTop: '0.75rem', marginBottom: '0.75rem' }}>
                  <label htmlFor="party-hint">Party Hint (Wallet Name)</label>
                  <input
                    id="party-hint"
                    type="text"
                    value={partyHint}
                    onChange={(e) => setPartyHint(e.target.value)}
                    placeholder="demo-wallet-1"
                  />
                  <small style={{ color: '#666', marginTop: '0.25rem', display: 'block' }}>
                    This will become part of your party ID (e.g., {partyHint}::12203bef...)
                  </small>
                </div>

                <button
                  className="button primary"
                  onClick={createWallet}
                  disabled={loading || !partyHint}
                  style={{ marginTop: '0.5rem' }}
                >
                  Create External Wallet
                  {loading && <span className="loading"></span>}
                </button>
              </div>

              {/* Manual Party Entry (Alternative) */}
              <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#f5f5f5', borderRadius: '4px', borderLeft: '4px solid #757575' }}>
                <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1em', color: '#424242' }}>
                  🔧 Or Use Existing Party ID
                </h3>
                <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85em', lineHeight: '1.5', color: '#666' }}>
                  If you already created a party via Canton console, paste it here:
                </p>

                <div className="form-group">
                  <label htmlFor="manual-party">Party ID</label>
                  <input
                    id="manual-party"
                    type="text"
                    value={manualPartyId}
                    onChange={(e) => setManualPartyId(e.target.value)}
                    placeholder="demo-wallet-1::12203bef03ef28882157f215..."
                  />
                  <small style={{ color: '#666', marginTop: '0.25rem', display: 'block' }}>
                    Format: party-hint::fingerprint
                  </small>
                </div>
                <button
                  className="button secondary"
                  onClick={useExistingParty}
                  disabled={!manualPartyId}
                >
                  Use This Party ID
                </button>
              </div>
            </>
          ) : (
            <div className="info-box">
              <h3>Wallet Details {wallet.createdAt && <span style={{fontSize: '0.8em', color: '#666'}}>({new Date(wallet.createdAt).toLocaleString()})</span>}</h3>
              
              <div className="wallet-detail">
                <strong>Party Hint:</strong> {wallet.partyHint || 'N/A'}
              </div>
              
              <div className="wallet-detail">
                <strong>Party ID:</strong> 
                <div className="copyable-field">
                  <code className="party-id">{wallet.partyId}</code>
                  <button 
                    className="copy-btn" 
                    onClick={() => copyToClipboard(wallet.partyId, 'Party ID')}
                    title="Copy Party ID"
                  >
                    📋
                  </button>
                </div>
              </div>
              
              <div className="wallet-detail">
                <strong>Public Key:</strong>
                <div className="copyable-field">
                  <code className="public-key">{wallet.publicKey}</code>
                  <button 
                    className="copy-btn" 
                    onClick={() => copyToClipboard(wallet.publicKey, 'Public Key')}
                    title="Copy Public Key"
                  >
                    📋
                  </button>
                </div>
              </div>
              
              <div className="wallet-detail">
                <strong>Private Key:</strong>
                <div className="copyable-field">
                  <code className="private-key">{wallet.privateKey}</code>
                  <button 
                    className="copy-btn" 
                    onClick={() => copyToClipboard(wallet.privateKey, 'Private Key')}
                    title="Copy Private Key"
                  >
                    📋
                  </button>
                </div>
              </div>
              
              <div className="wallet-detail">
                <strong>Fingerprint:</strong> <code>{wallet.fingerprint}</code>
              </div>
              
              <div className="wallet-actions">
                <button
                  className="button danger small"
                  onClick={clearWallet}
                  title="Clear wallet data from local storage"
                >
                  🗑️ Clear Wallet
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Token Creation */}
      {wallet && (
        <div className="card">
          <h2>3. Create Token</h2>

          {!createdToken && (
            <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#e8f5e9', borderRadius: '4px', borderLeft: '4px solid #4caf50' }}>
              <p style={{ margin: 0, fontSize: '0.9em', lineHeight: '1.5' }}>
                📝 Creating a token creates an <strong>Instrument contract</strong> on Canton ledger. The admin (app_provider) owns it and can mint tokens to users.
              </p>
            </div>
          )}

          {/* Token Selector Dropdown - shown when tokens exist */}
          {allTokens.length > 0 && (
            <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <label htmlFor="token-selector" style={{ fontWeight: 'bold', marginBottom: 0 }}>
                  Select Token for Minting:
                </label>
                <button
                  className="button danger small"
                  onClick={clearAllTokens}
                  title="Clear all saved tokens"
                >
                  🗑️ Clear All Tokens
                </button>
              </div>
              <select
                id="token-selector"
                value={selectedToken?.contractId || ''}
                onChange={(e) => {
                  const token = allTokens.find(t => t.contractId === e.target.value);
                  setSelectedToken(token || null);
                  if (token) {
                    setCreatedToken(token);
                  }
                }}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: '4px',
                  border: '1px solid #ddd'
                }}
              >
                <option value="">-- Select a token --</option>
                {allTokens.map((token) => (
                  <option key={token.contractId} value={token.contractId}>
                    {token.symbol} - {token.name} ({token.contractId.substring(0, 20)}...)
                  </option>
                ))}
              </select>
            </div>
          )}

          {!createdToken ? (
            <>
              <div className="form-group">
                <label htmlFor="token-name">Token Name</label>
                <input
                  id="token-name"
                  type="text"
                  value={tokenName}
                  onChange={(e) => setTokenName(e.target.value)}
                  placeholder="Demo Token"
                />
              </div>
              <div className="form-group">
                <label htmlFor="token-symbol">Token Symbol</label>
                <input
                  id="token-symbol"
                  type="text"
                  value={tokenSymbol}
                  onChange={(e) => setTokenSymbol(e.target.value)}
                  placeholder="DEMO"
                />
              </div>
              <div className="form-group">
                <label htmlFor="token-decimals">Decimals</label>
                <input
                  id="token-decimals"
                  type="number"
                  value={tokenDecimals}
                  onChange={(e) => setTokenDecimals(e.target.value)}
                  min="0"
                  max="18"
                />
              </div>
              <button 
                className="button secondary" 
                onClick={createToken}
                disabled={loading}
              >
                Create Token
                {loading && <span className="loading"></span>}
              </button>
            </>
          ) : (
            <div className="info-box">
              <h3>Token Details {createdToken.createdAt && <span style={{fontSize: '0.8em', color: '#666'}}>({new Date(createdToken.createdAt).toLocaleString()})</span>}</h3>
              
              <div className="token-detail">
                <strong>Token Name:</strong> {createdToken.name}
              </div>
              
              <div className="token-detail">
                <strong>Token Symbol:</strong> <code>{createdToken.symbol}</code>
              </div>
              
              <div className="token-detail">
                <strong>Decimals:</strong> {createdToken.decimals}
              </div>
              
              <div className="token-detail">
                <strong>Token ID:</strong>
                <div className="copyable-field">
                  <code className="token-id">{createdToken.tokenId}</code>
                  <button 
                    className="copy-btn" 
                    onClick={() => copyToClipboard(createdToken.tokenId, 'Token ID')}
                    title="Copy Token ID"
                  >
                    📋
                  </button>
                </div>
              </div>
              
              <div className="token-detail">
                <strong>Contract ID:</strong>
                <div className="copyable-field">
                  <code className="contract-id">{createdToken.contractId || createdToken.tokenId}</code>
                  <button 
                    className="copy-btn" 
                    onClick={() => copyToClipboard(createdToken.contractId || createdToken.tokenId, 'Contract ID')}
                    title="Copy Contract ID"
                  >
                    📋
                  </button>
                </div>
              </div>
              
              <div className="token-detail">
                <strong>Admin:</strong> <code className="admin-id">{createdToken.admin}</code>
              </div>
              
              {createdToken.isRealContract && (
                <div className="token-status">
                  ✅ <strong>Real DAML Contract</strong> - This token exists on Canton ledger
                </div>
              )}

              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                <button
                  className="button secondary"
                  onClick={() => {
                    setCreatedToken(null);
                    setTokenName('');
                    setTokenSymbol('');
                    setTokenDecimals(2);
                    storageService.clearToken();
                  }}
                  style={{ flex: 1 }}
                >
                  ➕ Create Another Token
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Token Balance & Holdings - Show whenever wallet is connected */}
      {wallet && (
        <div className="card">
          <h2>4. Your Token Holdings</h2>

          {/* Explanation for burn */}
          {tokenBalance > 0 && (
            <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#ffebee', borderRadius: '4px', borderLeft: '4px solid #f44336' }}>
              <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1em', color: '#c62828' }}>
                🔥 About Burning Tokens
              </h3>
              <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.9em', lineHeight: '1.5' }}>
                Burning permanently removes tokens from the ledger (reduces supply). Click the 🔥 Burn button next to any holding to burn it immediately.
              </p>
              <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85em', color: '#666' }}>
                💡 <strong>Design note:</strong> Burn happens immediately because the ProposeBurn choice is consuming by default in DAML (archives the Holding). This differs from minting which uses a two-step propose-accept pattern for cross-participant operations.
              </p>
            </div>
          )}

          <div className="info-box">
            <h3>Total Balance</h3>
            <p><strong>{tokenBalance} tokens</strong></p>

            {balanceBreakdown.length > 0 ? (
              <div style={{ marginTop: '1rem', borderTop: '1px solid #e0e0e0', paddingTop: '1rem' }}>
                <h4 style={{ fontSize: '0.9em', marginBottom: '0.5rem', color: '#666' }}>Breakdown by Token:</h4>
                {balanceBreakdown.map((item, index) => (
                  <div key={item.instrumentId} style={{
                    padding: '0.75rem 0',
                    borderBottom: index < balanceBreakdown.length - 1 ? '1px solid #f0f0f0' : 'none'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '1em', fontWeight: '500', color: '#333' }}>
                          {item.name} ({item.symbol})
                        </div>
                        <code style={{ fontSize: '0.75em', color: '#999' }}>
                          {item.instrumentId.substring(0, 20)}...
                        </code>
                      </div>
                      <div style={{ textAlign: 'right', marginLeft: '1rem' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '1.1em' }}>
                          {item.amount} {item.symbol}
                        </div>
                        <div style={{ fontSize: '0.75em', color: '#666' }}>
                          {item.count} holding{item.count !== 1 ? 's' : ''}
                        </div>
                      </div>
                    </div>
                    {/* Individual holdings with burn buttons */}
                    <div style={{ marginLeft: '1rem', marginTop: '0.5rem', fontSize: '0.85em' }}>
                      {/* <div style={{ fontSize: '0.8em', color: '#999', marginBottom: '0.25rem' }}>
                        DEBUG: holdings={item.holdings ? item.holdings.length : 'undefined'}
                      </div> */}
                      {item.holdings && item.holdings.length > 0 ? (
                        item.holdings.map((holding, hIndex) => (
                          <div key={holding.contractId} style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '0.25rem 0',
                            color: '#666'
                          }}>
                            <div style={{ flex: 1 }}>
                              <code style={{ fontSize: '0.9em' }}>
                                {holding.contractId.substring(0, 15)}...
                              </code>
                              <span style={{ marginLeft: '0.5rem' }}>
                                {holding.amount} {item.symbol}
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              {/* <button
                                onClick={() => transferToAdmin(holding.contractId, holding.amount, item.symbol)}
                                disabled={loading}
                                style={{
                                  padding: '0.25rem 0.5rem',
                                  fontSize: '0.75em',
                                  backgroundColor: '#4ecdc4',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: loading ? 'not-allowed' : 'pointer',
                                  opacity: loading ? 0.5 : 1
                                }}
                              >
                                ↩️ Transfer
                              </button> */}
                              <button
                                onClick={() => burnHolding(holding.contractId, holding.amount, item.symbol)}
                                disabled={loading}
                                style={{
                                  padding: '0.25rem 0.5rem',
                                  fontSize: '0.75em',
                                  backgroundColor: '#ff6b6b',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: loading ? 'not-allowed' : 'pointer',
                                  opacity: loading ? 0.5 : 1
                                }}
                              >
                                🔥 Burn
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div style={{ color: '#999', fontSize: '0.8em' }}>
                          No individual holdings data available
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ marginTop: '0.5rem', color: '#666', fontSize: '0.9em' }}>
                No holdings yet. Create a token and mint some!
              </p>
            )}
          </div>
        </div>
      )}

      {/* Token Minting - Two Step Flow */}
      {createdToken && (
        <div className="card">
          <h2>5. Mint Tokens (Two-Step Flow)</h2>

          {/* Explanation Box */}
          <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#fff3e0', borderRadius: '4px', borderLeft: '4px solid #ff9800' }}>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1em', color: '#e65100' }}>
              🔄 Why two steps?
            </h3>
            <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.9em', lineHeight: '1.5' }}>
              Admin and your wallet are on <strong>different Canton participants</strong>. Cross-participant operations require a propose-and-accept pattern:
            </p>
            <ol style={{ margin: '0', paddingLeft: '1.5rem', fontSize: '0.9em', lineHeight: '1.6' }}>
              <li><strong>Step 1 (Issue):</strong> Admin creates a HoldingProposal contract for you</li>
              <li><strong>Step 2 (Accept):</strong> You accept the proposal to create a Holding contract with tokens</li>
            </ol>
            <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85em', color: '#666' }}>
              💡 This creates a secure, auditable trail on the Canton ledger.
            </p>
          </div>

          <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#e3f2fd', borderRadius: '4px', borderLeft: '4px solid #2196F3' }}>
            <strong>Minting for:</strong> {createdToken.symbol} - {createdToken.name}
          </div>

          {/* Step 1: Issue */}
          <div className="form-group">
            <label htmlFor="mint-amount">Amount to Issue</label>
            <input
              id="mint-amount"
              type="number"
              value={mintAmount}
              onChange={(e) => setMintAmount(e.target.value)}
              min="1"
              disabled={pendingProposal !== null}
            />
          </div>
          <button
            className="button secondary"
            onClick={issueTokens}
            disabled={loading || pendingProposal !== null}
          >
            Step 1: Issue {mintAmount} {createdToken.symbol} (Create Proposal)
            {loading && <span className="loading"></span>}
          </button>

          {/* Step 2: Accept (only shown when proposal exists) */}
          {pendingProposal && (
            <div className="info-box" style={{ marginTop: '1rem', backgroundColor: '#fff3cd' }}>
              <h3>⏳ Pending Proposal</h3>
              <p>Amount: <strong>{pendingProposal.amount} {createdToken.symbol}</strong></p>
              <p>Proposal ID: <code>{pendingProposal.proposalId.substring(0, 30)}...</code></p>
              <button
                className="button primary"
                onClick={acceptProposal}
                disabled={loading}
                style={{ marginTop: '0.5rem' }}
              >
                Step 2: Accept Proposal (Mint Tokens)
                {loading && <span className="loading"></span>}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
