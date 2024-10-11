// use std::{alloc::System, task::Context};

// use std::alloc::System;
use anchor_lang::prelude::*;

use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount, Transfer, transfer}
};
use solana_program::clock::Clock;

declare_id!("H4JKF5nWQf9s8b3CuU5no6emvKjf6qEfBtkjb8mK7UHj");

pub mod constants {
    pub const VAULT_SEED: &[u8] = b"vault";
    pub const STAKE_INFO_SEED: &[u8] = b"stake_info";
    pub const TOKEN_SEED: &[u8] = b"token";
    pub const CONFIG_SEED: &[u8] = b"config";
    // pub const ADMIN_SEED: &[u8] = b"admin_config";
}

#[program]
pub mod staking_program {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, reward_rate: u64, admin: Pubkey) -> Result<()> {
        let stake_config = &mut ctx.accounts.stake_config;
        stake_config.reward_rate = reward_rate;
        stake_config.admin = admin;
        Ok(())
    }

    pub fn set_reward_rate(ctx: Context<SetRewardRate>, new_reward_rate: u64) -> Result<()> {

    let stake_config = &mut ctx.accounts.stake_config;
    // 验证是否为管理员
    require_keys_eq!(stake_config.admin, ctx.accounts.admin.key(), ErrorCode::Unauthorized);
    // 更新奖励率
    stake_config.reward_rate = new_reward_rate;
    msg!("Reward rate update to {}", new_reward_rate);
    Ok(())
}

    pub fn stake(ctx: Context<Stake>, amount: u64) -> Result<()> {
        let stake_info = &mut ctx.accounts.stake_info_account;

        if stake_info.is_staked {
            return Err(ErrorCode::IsStaked.into());
        }

        if amount <= 0 {
            return Err(ErrorCode::NoTokens.into());
        }

        let clock = Clock::get()?;

        stake_info.stake_at_slot = clock.slot;
        stake_info.is_staked = true;

        let stake_amount = (amount)
            .checked_mul(10u64.pow(ctx.accounts.mint.decimals as u32))
            .unwrap();

        transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_token_account.to_account_info(),
                    to: ctx.accounts.stake_account.to_account_info(),
                    authority: ctx.accounts.signer.to_account_info(),
                }
            ),
            stake_amount,
        )?;

        Ok(())
    }    

    pub fn destake(ctx: Context<Destake>) -> Result<()> {
        let stake_info = &mut ctx.accounts.stake_info_account;

        if !stake_info.is_staked {
            return Err(ErrorCode::NotStaked.into());
        }

        let clock = Clock::get()?;
        let slots_passed = clock.slot - stake_info.stake_at_slot;

        let stake_amount = ctx.accounts.stake_account.amount;
        
        let reward_rate = ctx.accounts.stake_config.reward_rate;
        let reward = (slots_passed as u64)
            .checked_mul(reward_rate)
            .unwrap();

        let bump = *ctx.bumps.get("token_vault_account").unwrap();
        let signer: &[&[&[u8]]] = &[&[constants::VAULT_SEED, &[bump]]];

        transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer{
                    from: ctx.accounts.token_vault_account.to_account_info(),
                    to: ctx.accounts.user_token_account.to_account_info(),
                    authority: ctx.accounts.token_vault_account.to_account_info(),
                },
                signer
            ),
            reward
        )?;

        let staker  = ctx.accounts.signer.key();
        let bump = *ctx.bumps.get("stake_account").unwrap();
        let signer: &[&[&[u8]]] = &[&[constants::TOKEN_SEED, staker.as_ref(), &[bump]]];

        transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer{
                    from: ctx.accounts.stake_account.to_account_info(),
                    to: ctx.accounts.user_token_account.to_account_info(),
                    authority: ctx.accounts.stake_account.to_account_info(),
                },
                signer
            ),
            stake_amount,
        )?;

        stake_info.is_staked = false;
        stake_info.stake_at_slot = clock.slot;

        Ok(())
    }


}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub signer : Signer<'info>,

    #[account(
        init,
        seeds = [constants::CONFIG_SEED],
        bump,
        payer = signer,
        space = 8 + std::mem::size_of::<StakeConfig>()
    )]
    pub stake_config: Account<'info, StakeConfig>,

    #[account(
        init_if_needed,
        seeds = [constants::VAULT_SEED],
        bump,
        payer = signer,
        token::mint = mint,
        token::authority = token_vault_account,
    )]
    pub token_vault_account: Account<'info, TokenAccount>,
    pub mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>
}

#[derive(Accounts)]
pub struct SetRewardRate<'info> {
    #[account(mut)]
    pub stake_config: Account<'info, StakeConfig>,
    #[account(mut)]
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        init_if_needed,
        seeds = [constants::STAKE_INFO_SEED, signer.key.as_ref()],
        bump,
        payer = signer,
        space = 8 + std::mem::size_of::<StakeInfo>()
    )]
    pub stake_info_account: Account<'info, StakeInfo>,

    #[account(
        init_if_needed,
        seeds = [constants::TOKEN_SEED, signer.key.as_ref()],
        bump,
        payer = signer,
        token::mint = mint,
        token::authority = stake_account
    )]
    pub stake_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = signer,
    )]
    pub user_token_account: Account<'info, TokenAccount>,


    pub mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>
}

#[derive(Accounts)]
pub struct Destake<'info>{
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [constants::VAULT_SEED],
        bump,
    )]
    pub token_vault_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [constants::STAKE_INFO_SEED, signer.key.as_ref()],
        bump,
    )]
    pub stake_info_account: Account<'info, StakeInfo>,

    #[account(
        mut,
        seeds = [constants::TOKEN_SEED, signer.key.as_ref()],
        bump,
    )]
    pub stake_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = signer,
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(
        seeds = [constants::CONFIG_SEED],
        bump,
    )]
    pub stake_config: Account<'info, StakeConfig>,

    pub mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>
}

#[account]
pub struct StakeInfo {
    pub stake_at_slot: u64,
    pub is_staked: bool,
}

#[account]
pub struct StakeConfig {
    pub reward_rate: u64,
    pub admin: Pubkey,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Token are already staked")]
    IsStaked,
    #[msg{"Tokens not staked"}]
    NotStaked,
    #[msg("No Tokens to stake")]
    NoTokens,
    #[msg("Unauthorized: Only the admin can perform this action.")]
    Unauthorized,
}