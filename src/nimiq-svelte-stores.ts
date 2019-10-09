import { readable, writable, derived, Readable, Writable } from 'svelte/store'
import * as Nimiq from '@nimiq/core-web/types'

type AccountIn = {
	address: Nimiq.Address | string,
}
type ParsedAccountIn = {
	address: Nimiq.Address
}
type Account = {
	address: Nimiq.Address,
	type?: string,
	balance?: number,

	// Vesting Contracts
	owner?: string,
	vestingStart?: number,
	vestingStepBlocks?: number,
	vestingStepAmount?: number,
	vestingTotalAmount?: number,

	// HTLCs
	sender?: string,
	recipient?: string,
	hashRoot?: string,
	hashCount?: number,
	timeout?: number,
	totalAmount?: number,
}
type AddressLike = Nimiq.Address | string | AccountIn

function addressLikes2AccountIns (input?: AddressLike | AddressLike[]): ParsedAccountIn[] {
	const addressLikes = input
		? (Array.isArray(input)
			? input
			: [input])
		: []
	return addressLikes.map(addressLike => ({
		...((addressLike as AccountIn).address ? (addressLike as AccountIn) : {}),
		address: Nimiq.Address.fromAny((addressLike as AccountIn).address || (addressLike as Nimiq.Address | string))
	}))
}

// let options = {
// 	network: 'main',
// 	features: [],
// 	volatile: undefined,
// 	blockConfirmations: undefined,
// }

export let client: Nimiq.Client

const _ready = writable<boolean>(false)
export const ready = derived<boolean, Writable<boolean>>(
	_ready,
	$_ready => $_ready
)

export const init = Nimiq.WasmHelper.doImport().then(() => {
	Nimiq.GenesisConfig.main()
	client = Nimiq.Client.Configuration.builder().instantiateClient()
	_ready.set(true)
	return client
})


/**
 * Consensus
 */

export const consensus = readable<string>('loading', function start(set) {
	let handle: Nimiq.Handle
	init.then(() => {
		set(client._consensusState)
		client.addConsensusChangedListener(set).then(h => handle = h)
	})

	return function stop() {
		init.then(() => client.removeListener(handle))
	}
})

export const established = derived<boolean, Readable<string>>(
	consensus,
	$consensus => $consensus === 'established'
)


/**
 * Blockchain
 */

export const headHash = readable<Nimiq.Hash | null>(null, function start(set) {
	let handle: Nimiq.Handle
	init.then(() => {
		if (client._consensusState === 'established') client.getHeadHash().then(set)
		client.addHeadChangedListener(hash => set(hash)).then(h => handle = h)
	})

	return function stop() {
		init.then(() => client.removeListener(handle))
	}
})

export const head = derived<Nimiq.Block | null, Readable<Nimiq.Hash | null>>(
	headHash,
	($headHash, set) => {
		if ($headHash) client.getBlock($headHash).then(set)
	},
	null
)

export const height = derived<number, Readable<Nimiq.Block | null>>(
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
	let interval: number
	init.then(() => {
		client.network.getStatistics().then(set)
		interval = window.setInterval(() => client.network.getStatistics().then(set), 1000)
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
	const accountsMap = new Nimiq.HashMap<Nimiq.Address, Account>()

	function add(input: AddressLike | AddressLike[]) {
		const accounts = addressLikes2AccountIns(input)
		if (!accounts.length ) return

		const newAccounts: Account[] = []
		for (const account of accounts) {
			const storedAccount = accountsMap.get(account.address)
			const newAccount = {
				...(storedAccount || {}),
				...account,
			}
			accountsMap.put(account.address, newAccount)
			if (!storedAccount) newAccounts.push(newAccount)
		}

		set(accountsMap.values())

		if (newAccounts.length) refresh(newAccounts)
	}

	function remove(input: AddressLike | AddressLike[]) {
		const accounts = addressLikes2AccountIns(input)
		if (!accounts.length ) return

		for (const account of accounts) {
			accountsMap.remove(account.address)
		}
		set(accountsMap.values())
	}

	function refresh(input?: AddressLike | AddressLike[]) {
		let accounts = addressLikes2AccountIns(input)
		if (!accounts.length) accounts = accountsMap.values()

		const addresses = accounts.map(account => account.address)
		console.debug('accounts->refresh', addresses.map(a => a.toPlain()))

		_accountsRefreshing.update(c => c + 1)

		init.then(() => {
			client.waitForConsensusEstablished().then(() => {
				client.getAccounts(addresses)
					.then(accounts => {
						for (const [i, account] of accounts.entries()) {
							const address = addresses[i]
							const storedAccount = accountsMap.get(address) || { address }
							accountsMap.put(address, {
								...storedAccount,
								...account.toPlain(),
							})
						}
						set(accountsMap.values())
					})
					.finally(() => _accountsRefreshing.update(c => c - 1))
			})
		})
	}

	const { subscribe, set } = writable<Account[]>([], function start() {
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
export const accountsRefreshing = derived<boolean, Readable<number>>(
	_accountsRefreshing,
	$_accountsRefreshing => $_accountsRefreshing > 0
)


/**
 * Transactions
 */

export const newTransaction: Readable<Nimiq.Client.TransactionDetails | null> = (function createNewTransactionStore() {
	let handle: Nimiq.Handle

	function onAccountsChanged(accounts: Account[]) {
		console.debug('createNewTransactionStore->onAccountsChanged', accounts)
		init.then(() => {
			client.addTransactionListener(set, accounts.map(acc => acc.address)).then(newHandle => {
				client.removeListener(handle)
				handle = newHandle
			})
		})
	}

	const { subscribe, set } = writable<Nimiq.Client.TransactionDetails | null>(null, function start() {
		// Subscribe to address store
		const unsubscribeAccountsStore = accounts.subscribe(onAccountsChanged)

		return function stop() {
			unsubscribeAccountsStore()
			init.then(() => client.removeListener(handle))
		}
	})

	return { subscribe }
})()

export const transactions = (function createTransactionsStore() {
	const trackedAddresses = new Nimiq.HashSet<Nimiq.Address>()
	let transactionsArray: Nimiq.Client.TransactionDetails[] = []

	function transactionsForAddress(address: Nimiq.Address) {
		return transactionsArray.filter(tx => tx.sender.equals(address) || tx.recipient.equals(address))
	}

	function sort(a: Nimiq.Client.TransactionDetails, b: Nimiq.Client.TransactionDetails) {
		if (a.timestamp === b.timestamp) return 0
		else if (!a.timestamp) return -1
		else if (!b.timestamp) return 1
		else return b.timestamp - a.timestamp
	}

	function add(transactions: Nimiq.Client.TransactionDetails | Nimiq.Client.TransactionDetails[] | null) {
		if (!transactions) return
		if (!Array.isArray(transactions)) transactions = [transactions]
		if (!transactions.length) return

		transactions = transactions.map(tx => Nimiq.Client.TransactionDetails.fromPlain(tx))
		console.debug('transactions->add', transactions)

		const transactionsByHash = new Nimiq.HashMap<Nimiq.Hash, Nimiq.Client.TransactionDetails>()
		for (const tx of transactionsArray) {
			transactionsByHash.put(tx.transactionHash, tx)
		}

		for (const tx of transactions) {
			transactionsByHash.put(tx.transactionHash, tx)
		}

		transactionsArray = transactionsByHash.values().sort(sort)

		set(transactionsArray)
	}

	function refresh(input?: AddressLike | AddressLike[]) {
		let addresses = addressLikes2AccountIns(input).map(account => account.address)
		if (!addresses.length) addresses = trackedAddresses.values()
		if (!addresses.length) return

		console.debug('transactions->refresh', addresses.map(a => a.toPlain()))

		_transactionsRefreshing.update(c => c + 1)

		init.then(() => {
			client.waitForConsensusEstablished().then(() => {
				Promise.all(addresses.map(address => client.getTransactionsByAddress(address, 0, transactionsForAddress(address)).then(add)))
					.finally(() => _transactionsRefreshing.update(c => c - 1))
			})
		})
	}

	function onAccountsChanged(accounts: Account[]) {
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

	const { subscribe, set } = writable<Nimiq.Client.TransactionDetails[]>([], function start() {
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
export const transactionsRefreshing = derived<boolean, Readable<number>>(
	_transactionsRefreshing,
	$_transactionsRefreshing => $_transactionsRefreshing > 0
)
