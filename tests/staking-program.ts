import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { StakingProgram } from "../target/types/staking_program";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { createMint, getAccount, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { publicKey } from "@coral-xyz/anchor/dist/cjs/utils";
import * as dotenv from "dotenv";
dotenv.config();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe("staking-program", () => {
  // 配置本地测试连接
  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider);
  const payer = provider.wallet as anchor.Wallet;
  const connection = new Connection("http://127.0.0.1:8899", "confirmed");

  // 使用保存的spltoken
  const mintKeypair = Keypair.fromSecretKey(new Uint8Array(JSON.parse(process.env.MINT_KEYPAIR)));

  // 生成新spltoken
  // const mintKeypair = Keypair.generate();
  // console.log(mintKeypair);

  const program = anchor.workspace.StakingProgram as Program<StakingProgram>;

  async function createMintToken() {
    const mint = await createMint(
      connection,
      payer.payer,
      payer.publicKey,
      payer.publicKey,
      8,
      mintKeypair
    )
    console.log(mint);
  }
  // 生成新的admin
  // const adminKeypair = Keypair.generate();
  // console.log(adminKeypair);
  
  // 使用已保存的admin
  const adminKeypair = Keypair.fromSecretKey(new Uint8Array(JSON.parse(process.env.ADMIN_KEYPAIR)));

  it("Is initialized!", async () => {
    
    // await createMintToken();

    let [vaultAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault")],
      program.programId
    )

    let [stakeConfig] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId
    );

    const initialRewardRate = new anchor.BN(100);
    try{
      await program.account.stakeConfig.fetch(stakeConfig);
      console.log("StakeConfig account already exists, skipping initialization.");
    } catch (e) {
      const tx = await program.methods.initialize(initialRewardRate, adminKeypair.publicKey)
        .accounts({
          signer: payer.publicKey,
          tokenVaultAccount: vaultAccount,
          mint: mintKeypair.publicKey,
          stakeConfig: stakeConfig,
        })
        .rpc();
      console.log("Your transaction signature", tx);
    }

    // 输出保险库账户地址
    console.log("Vault Account Address: ", vaultAccount.toBase58());
    // 获取并输出 stakeConfig 的所有内容
    const stakeConfigAccount = await program.account.stakeConfig.fetch(stakeConfig);
    // 输出 stakeConfig 中的各个字段
    console.log("Admin (string):", stakeConfigAccount.admin.toBase58());
    console.log("Admin (JSON):", JSON.stringify(Array.from(stakeConfigAccount.admin.toBuffer())));
    console.log("Reward Rate:", stakeConfigAccount.rewardRate.toString());

  });

  it("Change reward rate by admin", async () => {
    let [stakeConfig] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId
    );

      // 设置新的奖励率
      const newRewardRate = new anchor.BN(200);

      const tx = await program.methods.setRewardRate(newRewardRate)
      .accounts({
        stakeConfig: stakeConfig,
        admin: adminKeypair.publicKey,
      })
      .signers([adminKeypair])
      .rpc();
      console.log("Reward rate change transaction signiture:", tx);

      // 验证奖励率是否已经更新
      const newStakeConfig = await program.account.stakeConfig.fetch(stakeConfig);
      console.log("Updated reward rate: ", newStakeConfig.rewardRate.toString());

      // 验证奖励率是否为正确新值
      if (newStakeConfig.rewardRate.toString() === newRewardRate.toString()) {
        console.log("Rewar rate successfully changed!");
      } else {
        console.error("Reward rate change failed");
      }  
  })

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
    //   1e9
    // )

    let [stakeInfo] = PublicKey.findProgramAddressSync(
      [Buffer.from("stake_info"), payer.publicKey.toBuffer()],
      program.programId
    );

    let [stakeAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("token"), payer.publicKey.toBuffer()],
      program.programId
    );

    await getOrCreateAssociatedTokenAccount(
      connection,
      payer.payer,
      mintKeypair.publicKey,
      payer.publicKey
    )

    // 获取质押前的用户余额
    try {
      const preStakeBalance = await getAccount(connection, userTokenAccount.address);
      console.log("User Token Account Balance before stake:", preStakeBalance.amount.toString());
    } catch (error) {
      console.error("Error fetching user token account:", error);
    }
    
    // 输出用户代币账户地址和质押账户地址
    console.log("Stake Info Account Address:", stakeInfo.toBase58());
    console.log("User Token Account Address:", userTokenAccount.address.toBase58());
    console.log("Stake Account Address:", stakeAccount.toBase58());

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

    // 等待一段时间获得较为精准的信息
    await sleep(4000);

    try {
      const stakeAccountInfo = await getAccount(connection, stakeAccount);
      console.log("Stake Account Balance:", stakeAccountInfo.amount.toString());
    } catch (error) {
      console.error("Error fetching stake account:", error);
    }

    const stakeInfoAccount = await program.account.stakeInfo.fetch(stakeInfo);
    console.log("Destake at slot:", stakeInfoAccount.stakeAtSlot.toString());
    console.log("Stake status:", stakeInfoAccount.isStaked);
    // 质押后用户的余额
    const postStakeBalance = await getAccount(connection, userTokenAccount.address);
    console.log("User Token Account Balance after stake:", postStakeBalance.amount.toString());
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

    let [stakeConfig] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId
    );

    // mint太多代币会导致溢出报错
    // await mintTo(
    //   connection,
    //   payer.payer,
    //   mintKeypair.publicKey,
    //   vaultAccount,
    //   payer.payer,
    //   1e11
    // );

    // 解除质押前用于余额
    const preDestakeBalance = await getAccount(connection, userTokenAccount.address);
    console.log("User Token Account Balance before destake:", preDestakeBalance.amount.toString());

    const tx = await program.methods
    .destake()
    .signers([payer.payer])
    .accounts({
      stakeAccount: stakeAccount,
      stakeInfoAccount: stakeInfo,
      userTokenAccount: userTokenAccount.address,
      tokenVaultAccount: vaultAccount,
      stakeConfig:stakeConfig,
      signer: payer.publicKey,
      mint: mintKeypair.publicKey,
    })
    .rpc();
    console.log("Your transaction signature", tx);

    // 等待一段时间获取较为精准的信息
    await sleep(1000);

    // 解除质押后用户的余额
    const postDestakeBalance = await getAccount(connection, userTokenAccount.address);
    console.log("User Token Account Balance after destake:", postDestakeBalance.amount.toString());
    
    // 更多调试信息
    const stakeInfoAccount = await program.account.stakeInfo.fetch(stakeInfo);
    console.log("Destake at slot:", stakeInfoAccount.stakeAtSlot.toString());
    console.log("Stake status:", stakeInfoAccount.isStaked);
    
    const stakeAccountInfo = await getAccount(connection, stakeAccount);
    console.log("Stake Account Balance:", stakeAccountInfo.amount.toString());

    const vaultAccountInfo = await getAccount(connection, vaultAccount);
    console.log("Vault Account Balance:", vaultAccountInfo.amount.toString());
    })

});