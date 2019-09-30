import { readable, writable, derived } from 'svelte/store'

// let options = {
// 	network: 'main',
// 	features: [],
// 	volatile: undefined,
// 	blockConfirmations: undefined,
// }

export let client

const _ready = writable(false)
export const ready = derived(
	_ready,
	$_ready => $_ready
)

export const init = Nimiq.WasmHelper.doImport().then(_ => {
	Nimiq.GenesisConfig.main()
	client = Nimiq.Client.Configuration.builder().instantiateClient()
	_ready.set(true)
	return client
})


/**
 * Consensus
 */

export const consensus = readable('loading', function start(set) {
	let handle
	init.then(_ => {
		set(client._consensusState)
		handle = client.addConsensusChangedListener(set)
	})

	return function stop() {
		init.then(_ => client.removeListener(handle))
	}
})

export const established = derived(
	consensus,
	$consensus => $consensus === 'established'
)


/**
 * Blockchain
 */

export const headHash = readable(null, function start(set) {
	let handle
	init.then(_ => {
		if (client._consensusState === 'established') client.getHeadHash().then(set)
		handle = client.addHeadChangedListener(hash => set(hash))
	})

	return function stop() {
		init.then(_ => client.removeListener(handle))
	}
})

export const head = derived(
	headHash,
	($headHash, set) => {
		if ($headHash) client.getBlock($headHash).then(set)
	},
	null
)

export const height = derived(
	head,
	$head => $head ? $head.height : 0
)


/**
 * Network
 */

 export const networkStatistics = readable({
	bytesReceived: 0,
	bytesSent: 0,
	totalPeerCount: 0,
	peerCountsByType: {
		total: 0,
		connecting: 0,
		dumb: 0,
		rtc: 0,
		ws: 0,
		wss: 0,
	},
	totalKnownAddresses: 0,
	knownAddressesByType: {
		total: 0,
		rtc: 0,
		ws: 0,
		wss: 0,
	},
	timeOffset: 0,
 }, function start(set) {
	let interval
	init.then(_ => {
		client.network.getStatistics().then(set)
		interval = setInterval(_ => client.network.getStatistics().then(set), 1000)
	})

	return function stop() {
		clearInterval(interval)
	}
})

export const peerCount = derived(
	networkStatistics,
	$networkStatistics => $networkStatistics ? $networkStatistics.totalPeerCount : 0
)


/**
 * Accounts
 */

export const accounts = (function createAccountsStore() {
	const accountsMap = new Nimiq.HashMap()

	function add(accounts) {
		if (!accounts ) return
		if (!Array.isArray(accounts)) accounts = [accounts]
		if (!accounts.length ) return

		const newAccounts = []
		for (const account of accounts) {
			const address = Nimiq.Address.fromAny(account.address || account)

			const storedAccount = accountsMap.get(address)
			const newAccount = {
				...(storedAccount || {}),
				...(account.address ? account : {}),
				address
			}
			accountsMap.put(address, newAccount)
			if (!storedAccount) newAccounts.push(newAccount)
		}

		set(accountsMap.values())

		if (newAccounts.length) refresh(newAccounts)
	}

	function remove(accounts) {
		if (!accounts) return
		if (!Array.isArray(accounts)) accounts = [accounts]
		if (!accounts.length ) return

		for (const account of accounts) {
			const address = Nimiq.Address.fromAny(account.address || account)
			accountsMap.remove(address)
		}
		set(accountsMap.values())
	}

	function refresh(accounts) {
		if (!accounts) accounts = accountsMap.keys()
		if (!Array.isArray(accounts)) accounts = [accounts]
		if (!accounts.length) return

		const addresses = accounts.map(account => Nimiq.Address.fromAny(account.address || account))
		console.debug('accounts->refresh', addresses.map(a => a.toPlain()))

		_accountsRefreshing.update(c => c + 1)

		init.then(_ => {
			client.waitForConsensusEstablished().then(_ => {
				client.getAccounts(addresses)
					.then(accounts => {
						for (const [i, account] of accounts.entries()) {
							const address = addresses[i]
							const storedAccount = accountsMap.get(address)
							accountsMap.put(address, {
								...(storedAccount || {}),
								...account.toPlain(),
								address,
							})
						}
						set(accountsMap.values())
					})
					.finally(_ => _accountsRefreshing.update(c => c - 1))
			})
		})
	}

	const { subscribe, set } = writable([], function start() {
		// Subscribe to headHash store
		const unsubscribeHeadHashStore = headHash.subscribe(() => refresh())

		return function stop() {
			unsubscribeHeadHashStore()
		}
	})

	return {
		subscribe,
		add,
		remove,
		refresh,
	}
})()

const _accountsRefreshing = writable(0)
export const accountsRefreshing = derived(
	_accountsRefreshing,
	$_accountsRefreshing => $_accountsRefreshing > 0
)


/**
 * Transactions
 */

export const newTransaction = (function createNewTransactionStore() {
	let handle

	function onAccountsChanged(accounts) {
		console.debug('createNewTransactionStore->onAccountsChanged', accounts)
		init.then(_ => {
			const newHandle = client.addTransactionListener(set, accounts.map(acc => acc.address))
			client.removeListener(handle)
			handle = newHandle
		})
	}

	const { subscribe, set } = writable(null, function start() {
		// Subscribe to address store
		const unsubscribeAccountsStore = accounts.subscribe(onAccountsChanged)

		return function stop() {
			unsubscribeAccountsStore()
			init.then(_ => client.removeListener(handle))
		}
	})

	return { subscribe }
})()

export const transactions = (function createTransactionsStore() {
	const trackedAddresses = new Nimiq.HashSet()
	let transactionsArray = []

	function transactionsForAddress(address) {
		return transactionsArray.filter(tx => tx.sender.equals(address) || tx.recipient.equals(address))
	}

	function sort(a, b) {
		if (a.timestamp === b.timestamp) return 0
		else if (!a.timestamp) return -1
		else if (!b.timestamp) return 1
		else return b.timestamp - a.timestamp
	}

	function add(transactions) {
		if (!transactions) return
		if (!Array.isArray(transactions)) transactions = [transactions]
		if (!transactions.length) return

		transactions = transactions.map(tx => Nimiq.Client.TransactionDetails.fromPlain(tx))
		console.debug('transactions->add', transactions)

		const transactionsByHash = new Nimiq.HashMap()
		for (const tx of transactionsArray) {
			transactionsByHash.put(tx.transactionHash, tx)
		}

		for (const tx of transactions) {
			transactionsByHash.put(tx.transactionHash, tx)
		}

		transactionsArray = transactionsByHash.values().sort(sort)

		set(transactionsArray)
	}

	function refresh(accounts) {
		if (!accounts) accounts = trackedAddresses.values()
		if (!Array.isArray(accounts)) accounts = [accounts]
		if (!accounts.length) return

		const addresses = accounts.map(account => Nimiq.Address.fromAny(account.address || account))
		console.debug('transactions->refresh', addresses.map(a => a.toPlain()))

		_transactionsRefreshing.update(c => c + 1)

		init.then(_ => {
			client.waitForConsensusEstablished().then(_ => {
				Promise.all(addresses.map(address => client.getTransactionsByAddress(address, 0, transactionsForAddress(address)).then(add)))
					.finally(_ => _transactionsRefreshing.update(c => c - 1))
			})
		})
	}

	function onAccountsChanged(accounts) {
		console.debug('createTransactionsStore->onAccountsChanged', accounts)

		// Find untracked addresses
		const newAddresses = []
		for (const address of accounts.map(acc => acc.address)) {
			if (trackedAddresses.contains(address)) continue
			newAddresses.push(address)
			trackedAddresses.add(address)
		}

		if (!newAddresses.length) return

		// Get transaction history for new addresses
		refresh(newAddresses)
	}

	const { subscribe, set } = writable([], function start() {
		// Subscribe to address store
		const unsubscribeAccountsStore = accounts.subscribe(onAccountsChanged)
		// Subscribe to newTransaction store
		const unsubscribeNewTransactionStore = newTransaction.subscribe(add)

		return function stop() {
			unsubscribeAccountsStore()
			unsubscribeNewTransactionStore()
		}
	})

	return {
		subscribe,
		add,
		refresh,
	}
})()

const _transactionsRefreshing = writable(0)
export const transactionsRefreshing = derived(
	_transactionsRefreshing,
	$_transactionsRefreshing => $_transactionsRefreshing > 0
)
