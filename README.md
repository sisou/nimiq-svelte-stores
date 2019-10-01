# Nimiq Svelte Stores

This library provides [SvelteJS](https://svelte.dev) stores for a [Nimiq](https://nimiq.com) Blockchain Client.

Client initialization is already handled for you (mainnet, pico client).
You simply import the stores that you need.

- [Example](#example)
- [Setup](#setup)
- [Stores](#stores)
- [Writable Stores](#writable-stores)
- [Client](#client)

## Example

- [Running example app](https://nimiq-svelte-stores.netlify.com)
- [The code for this example](https://github.com/sisou/nimiq-svelte-stores/blob/master/src/App.svelte)

## Setup

1. Install this library from [NPM](https://www.npmjs.com/package/nimiq-svelte-stores): `yarn add --dev nimiq-svelte-stores`.
2. Add the Nimiq script _before_ the bundle in your `public/index.html`:
   ```html
   <script defer src="https://cdn.jsdelivr.net/npm/@nimiq/core-web@v1.5/web.js"></script>
   ```
3. Import Nimiq stores into your components, see next section.

## Stores

```js
import {
    ready,
    consensus,
    established,
    headHash,
    head,
    height,
    networkStatistics,
    peerCount,
    accounts,
    accountsRefreshing,
    newTransaction,
    transactions,
    transactionsRefreshing,
} from 'nimiq-svelte-stores'
```

| Store | Type | Initial value |
|-------|------|---------------|
| ready | Boolean | `false` |
| consensus | String | `'loading'` |
| established | Boolean | `false` |
| headHash | [Nimiq.Hash](https://doc.esdoc.org/github.com/nimiq/core-js/class/src/main/generic/consensus/base/primitive/Hash.js~Hash.html) | `null` |
| head | [Nimiq.Block](https://doc.esdoc.org/github.com/nimiq/core-js/class/src/main/generic/consensus/base/block/Block.js~Block.html) | `null` |
| height | Number | `0` |
| networkStatistics | [Nimiq.Client.NetworkStatistics](https://doc.esdoc.org/github.com/nimiq/core-js/class/src/main/generic/api/NetworkClient.js~NetworkStatistics.html) | `Object` |
| peerCount | Number | `0` |
| accounts | Array<{address: [Nimiq.Address](https://doc.esdoc.org/github.com/nimiq/core-js/class/src/main/generic/consensus/base/account/Address.js~Address.html), ...}> | `[]` |
| accountsRefreshing | Boolean | `false` |
| newTransaction | [Nimiq.Client.TransactionDetails](https://doc.esdoc.org/github.com/nimiq/core-js/class/src/main/generic/api/TransactionDetails.js~TransactionDetails.html) | `null` |
| transactions | Array<[Nimiq.Client.TransactionDetails](https://doc.esdoc.org/github.com/nimiq/core-js/class/src/main/generic/api/TransactionDetails.js~TransactionDetails.html)> | `[]` |
| transactionsRefreshing | Boolean | `false` |

## Writable Stores

The `accounts` and `transactions` stores expose methods to write to them and trigger actions.

### accounts.add()

You can add one or more accounts to the `accounts` store by passing the following types to the `accounts.add()` method:

* [`Nimiq.Address`](https://doc.esdoc.org/github.com/nimiq/core-js/class/src/main/generic/consensus/base/account/Address.js~Address.html)
* `string` (userfriendly, hex or base64 address representation)
* `Object<{address: Nimiq.Address | string}>`
* Array of these types

If you add objects, they can include whatever properties you like, as long as they have an `address` property
which can be interpreted as a Nimiq address. All other properties on the object are preserved and added to the store.
You can use this for example to store an account `label` or other meta data in the `accounts` store.

>The `accounts` store automatically populates and updates accounts' `balance` and `type` fields from the blockchain,
>while consensus is established (as well as other relevant fields for [vesting contracts](https://doc.esdoc.org/github.com/nimiq/core-js/class/src/main/generic/consensus/base/account/VestingContract.js~VestingContract.html) and [HTLCs](https://doc.esdoc.org/github.com/nimiq/core-js/class/src/main/generic/consensus/base/account/HashedTimeLockedContract.js~HashedTimeLockedContract.html)).

### accounts.remove()

Accounts may be removed from the `accounts` store with the `accounts.remove()` method.
The method takes the same arguments as the `add` method above.

### accounts.refresh()

The `accounts.refresh()` method can be used to manually trigger a blockchain sync of some or all stored `accounts`.
When passed any of the arguments accepted by the `add` method, only those accounts are refreshed.
If no argument is passed, all stored accounts are refreshed.

### transactions.add()

You can add single or an array of known [`Nimiq.Client.TransactionDetails`](https://doc.esdoc.org/github.com/nimiq/core-js/class/src/main/generic/api/TransactionDetails.js~TransactionDetails.html) to the `transactions` store with
the `transactions.add()` method.
These transaction details are then used when fetching the transaction history for an account, and prevent
a great amount of data from being downloaded again.

>When subscribing to the `transactions` store, the transaction history for all stored and newly added accounts
>is automatically fetched while consensus is established.

### transactions.refresh()

The `transactions.refresh()` method can be used to manually trigger fetching the transaction history of some
or all stored `accounts`. When passed any of the arguments accepted by the `accounts.add` method, only the histories
of those accounts are refreshed. If no argument is passed, the history of all stored accounts is refreshed.

## Client

This library exposes a [Nimiq Client](https://doc.esdoc.org/github.com/nimiq/core-js/class/src/main/generic/api/Client.js~Client.html) as the `client` export.
This export is `undefined` until:

- the `ready` store turned `true` or
- the exported `init` promise resolved

There are two ways to make sure the `client` is defined when you use it:

1. Only enable `client`-triggering elements when the `ready` store turned `true`:

```html
<script>
    import { ready, client } from 'nimiq-svelte-stores'

    function sendTransaction() {
        const tx = ...
        client.sendTransaction(tx)
    }
</script>

<button disabled={!$ready} on:click={sendTransaction}>Send Transaction</button>
```

2. Await the exported `init` promise:

```js
import { init, client } from 'nimiq-svelte-stores'

async function sendTransaction() {
    const tx = ...;
    await init // or: const client = await init
    client.sendTransaction(tx)
}
```

The Nimiq Client API is documented here: https://doc.esdoc.org/github.com/nimiq/core-js/class/src/main/generic/api/Client.js~Client.html

Tutorials for sending transactions are here: https://nimiq.github.io/tutorials/basics-3-transactions
