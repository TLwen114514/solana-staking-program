const anchor = require("@coral-xyz/anchor");
const { Connection, PublicKey } = require("@solana/web3.js");
const { getAccount } = require("@solana/spl-token");
const dotenv = require("dotenv");
dotenv.config();

const WALLET_PATH = process.env.ANCHOR_WALLET;
const PROVIDER_URL = process.env.ANCHOR_PROVIDER_URL;

async function main() {
  const connection = new Connection(PROVIDER_URL, "confirmed");

  const wallet = new anchor.Wallet(require(WALLET_PATH));
  const provider = new anchor.AnchorProvider(connection, wallet, anchor.AnchorProvider.defaultOptions());
  anchor.setProvider(provider);

  const mintKeypair = anchor.web3.Keypair.fromSecretKey(new Uint8Array(JSON.parse(process.env.MINT_KEYPAIR)));
  
  // 指定要查询的账户地址
  const userTokenAccountAddress = new PublicKey("31GAnRE1ShJ4LjhjUbekPV8Hfd6eNDFyupMjvFkCr3fV");
  const stakeAccountAddress = new PublicKey("5ak6YVRbQMxbUJn4kBUZhJzZRWwVnvMxXauHd7sAdGmX");
  const vaultAccountAddress = new PublicKey("94qWZXKgUANxbSJwnG8pPzhVHJ3N3QUvGVNtm7KU3fkT");

  try {
    const userTokenAccount = await getAccount(connection, userTokenAccountAddress);
    console.log("User Token Account Balance:", userTokenAccount.amount.toString());

    const stakeAccount = await getAccount(connection, stakeAccountAddress);
    console.log("Stake Account Balance:", stakeAccount.amount.toString());

    const vaultAccount = await getAccount(connection, vaultAccountAddress);
    console.log("Vault Account Balance:", vaultAccount.amount.toString());
  } catch (error) {
    console.error("Error fetching account balances:", error);
  }
}

main().catch(err => {
  console.error("Error running script:", err);
});
