import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { StakingProgram } from "../target/types/staking_program";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { createMint, getAccount, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { publicKey } from "@coral-xyz/anchor/dist/cjs/utils";

describe("staking-program", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider);
  const payer = provider.wallet as anchor.Wallet;
  const connection = new Connection("http://127.0.0.1:8899", "confirmed");
  const mintKeypair = Keypair.fromSecretKey(new Uint8Array(
    [
      182, 183,  64,  76,   8, 209, 102, 156, 235, 211, 202,
       10, 237,  97, 116,  69,  51, 118, 214, 247,   7, 151,
      136, 218, 189,   0, 102, 105, 119, 227,  98,  53, 155,
       37, 192,  76,  87, 118, 125, 206, 162,  42, 125,  87,
      178, 221,  88,  85, 236,  45, 179,   1,  13,  76, 201,
      139, 187,  91, 113,   2,  11, 167,  90,  14
    ]
  ));
  // console.log(mintKeypair);

  const program = anchor.workspace.StakingProgram as Program<StakingProgram>;

  async function createMintToken() {
    const mint = await createMint(
      connection,
      payer.payer,
      payer.publicKey,
      payer.publicKey,
      9,
      mintKeypair
    )
    console.log(mint);
    
  }

  it("Is initialized!", async () => {
    
    // await createMintToken();

    let [vaultAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault")],
      program.programId
    )

    const tx = await program.methods.initialize()
      .accounts({
        signer: payer.publicKey,
        tokenVaultAccount: vaultAccount,
        mint: mintKeypair.publicKey
      })
      .rpc();
    console.log("Your transaction signature", tx);
  });

  it("stake", async() => {
    let userTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      payer.payer,
      mintKeypair.publicKey,
      payer.publicKey
    );

    // mint太多代币会导致溢出报错
    // await mintTo(
    //   connection,
    //   payer.payer,
    //   mintKeypair.publicKey,
    //   userTokenAccount.address,
    //   payer.payer,
    //   1e11
    // )

    let [stakeInfo] = PublicKey.findProgramAddressSync(
      [Buffer.from("stake_info"), payer.publicKey.toBuffer()],
      program.programId
    )

    let [stakeAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("token"), payer.publicKey.toBuffer()],
      program.programId
    )

    await getOrCreateAssociatedTokenAccount(
      connection,
      payer.payer,
      mintKeypair.publicKey,
      payer.publicKey
    )

    const tx = await program.methods
      .stake(new anchor.BN(1))
      .signers([payer.payer])
      .accounts({
        stakeInfoAccount: stakeInfo,
        stakeAccount: stakeAccount,
        userTokenAccount: userTokenAccount.address,
        mint: mintKeypair.publicKey,
        signer: payer.publicKey,
      })
      .rpc();

    console.log("Your transaction signature", tx);
  });

  it("destake", async() => {
    let userTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      payer.payer,
      mintKeypair.publicKey,
      payer.publicKey
    );

    let [stakeInfo] = PublicKey.findProgramAddressSync(
      [Buffer.from("stake_info"), payer.publicKey.toBuffer()],
      program.programId
    )

    let [stakeAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("token"), payer.publicKey.toBuffer()],
      program.programId
    )

    let [vaultAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault")],
      program.programId
    )

    // mint太多代币会导致溢出报错
    // await mintTo(
    //   connection,
    //   payer.payer,
    //   mintKeypair.publicKey,
    //   vaultAccount,
    //   payer.payer,
    //   1e21
    // );

    const tx = await program.methods
    .destake()
    .signers([payer.payer])
    .accounts({
      stakeAccount: stakeAccount,
      stakeInfoAccount: stakeInfo,
      userTokenAccount: userTokenAccount.address,
      tokenVaultAccount: vaultAccount,
      signer: payer.publicKey,
      mint: mintKeypair.publicKey,
    })
    .rpc();
    console.log("Your transaction signature", tx);

    const userTokenAccountInfo = await getAccount(connection, userTokenAccount.address);
    console.log("User Token Account Balance:", userTokenAccountInfo.amount.toString());
    
  })
});
