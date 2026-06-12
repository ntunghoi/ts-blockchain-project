# Glossary

## Checks-Effects-Interaction (CEI) Pattern

The **CEI (Checks-Effects-Interactions)** pattern is a foundational smart contract security standard. It mandates that functions be structured in three sequential phases: `validating inputs`, `modifying internal state`, and finally `executing external calls`.   

This specific ordering is universally adopted to prevent reentrancy attacks—a highly destructive vulnerability in blockchain development.

### The Three Phases of CEI

1. Checks (Validate prerequisites)

    * Verify all conditions required for the function to execute (e.g., Does the user have sufficient funds? Is the caller the authorized owner?).
    
    * In Solidity, this is typically handled by require statements or custom errors.

2. Effects (Update internal state)

    * Modify the contract's state variables (e.g., Deduct the user's token balance).
    
    * Crucially, all state updates must happen before interacting with outside accounts.
    
3. Interactions (Perform external calls)
    
    * Interact with other smart contracts or external accounts (e.g., Transfer Ether or tokens to the user).
    
### Why is CEI Important?

If a smart contract transfers funds to an external address before updating its internal records, a malicious external contract can exploit the transaction. During the transfer, the attacker can hijack the control flow (via fallback or receive functions) and recursively call the withdrawal function again.

Because the internal balance was never updated in the first step, the contract believes the attacker still has their original funds, allowing them to repeatedly drain the contract until it runs out of gas or funds.

Following the CEI pattern ensures that the contract's internal state accurately reflects the changes (e.g., the balance is reduced to 0) before any outside contract gains control of the transaction.

