<script>
import {
	ready,
	consensus,
	established,
	head,
	height,
	peerCount,
	networkStatistics,
	accounts,
	accountsRefreshing,
	newTransaction,
	transactions,
	transactionsRefreshing,
} from './nimiq-svelte-stores.js'

let address = 'NQ18 8JC8 DTKE 7G6V 6PJP 6VF8 1N5X K8Q7 21UX'
let label = 'My Address'
</script>

<div>Client ready: <strong>{ $ready }</strong></div>

<h3>Consensus</h3>
<div>Consensus: <strong>{ $consensus }</strong></div>
<div>Established: <strong>{ $established }</strong></div>

<h3>Blockchain</h3>
<div>Height: <strong>{ $height }</strong></div>
<div>Last Block Time: <strong>{ $head && new Date($head.timestamp * 1000).toLocaleString() }</strong></div>

<h3>Network</h3>
<div>Peers: <strong>{ $peerCount }</strong></div>
<div>Received: <strong>{ $networkStatistics.bytesReceived / 1000 } kB</strong></div>
<div>Sent: <strong>{ $networkStatistics.bytesSent / 1000 } kB</strong></div>
<div>Offset: <strong>{ $networkStatistics.timeOffset } ms</strong></div>

<h3>Accounts</h3>
<form>
	Address: <input bind:value={address}><br>
	Label: <input bind:value={label}>
</form>
<button on:click={() => accounts.add({ address, label })}>Add address</button>
<button on:click={() => accounts.refresh()} disabled={$accountsRefreshing}>Refresh balances</button>
<ul>
	{#each $accounts as account}
		<li>{account.label || '<unnamed>'} - {account.address.toPlain()} ({account.type}): {account.balance / 1e5} NIM</li>
	{/each}
</ul>

<h3>Transactions</h3>
<div>Latest: <strong>{ $newTransaction ? `Tx from ${$newTransaction.sender.toPlain()} to ${$newTransaction.recipient.toPlain()} of ${$newTransaction.value / 1e5} NIM, state: ${$newTransaction.state}` : '' }</strong></div>

<button on:click={() => transactions.refresh()} disabled={$transactionsRefreshing}>Refresh history</button>

<table border="1" cellspacing="0" cellpadding="4">
	<tr>
		<th>Time</th>
		<th>From</th>
		<th>To</th>
		<th>Value</th>
		<th>State</th>
	</tr>
	{#each $transactions as tx}
		<tr>
			<td>{new Date(tx.timestamp * 1000).toLocaleString()}</td>
			<td>{tx.sender.toPlain()}</td>
			<td>{tx.recipient.toPlain()}</td>
			<td>{tx.value / 1e5} NIM</td>
			<td>{tx.state}</td>
		</tr>
	{/each}
</table>

