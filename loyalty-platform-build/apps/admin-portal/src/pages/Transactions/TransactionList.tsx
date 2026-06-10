import { useMemo, useState } from 'react';
import { DataTable, type Column } from '../../components/DataTable';
import { useTransactions } from '../../hooks/useTransactions';
import { formatDateTime, formatCurrency, formatNumber } from '../../utils/format';
import type { TransactionDTO } from '../../api/types';

const columns: Column<TransactionDTO>[] = [
  { key: 'transactionId', header: 'ID', render: (r) => r.transactionId.slice(0, 8) + '...' },
  { key: 'memberId', header: 'Member', render: (r) => r.memberId.slice(0, 8) + '...' },
  { key: 'channel', header: 'Channel', sortable: true },
  { key: 'amount', header: 'Amount', sortable: true, render: (r) => formatCurrency(r.amount, r.currency) },
  { key: 'pointsEarned', header: 'Points', sortable: true, render: (r) => formatNumber(r.pointsEarned) },
  {
    key: 'storeName' as keyof TransactionDTO,
    header: 'Store',
    render: (r) =>
      r.storeName ? (
        <span title={r.storeId ?? ''}>{r.storeName}</span>
      ) : (
        <span className="text-slate-400">--</span>
      ),
  },
  {
    key: 'associateName' as keyof TransactionDTO,
    header: 'Associate',
    render: (r) =>
      r.associateName ? (
        <span title={r.associateId ?? ''}>{r.associateName}</span>
      ) : (
        <span className="text-slate-400">--</span>
      ),
  },
  {
    key: 'sourceChannel' as keyof TransactionDTO,
    header: 'Source',
    render: (r) =>
      r.sourceChannel ? (
        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          {r.sourceChannel}
        </span>
      ) : (
        <span className="text-slate-400">--</span>
      ),
  },
  {
    key: 'orderRef' as keyof TransactionDTO,
    header: 'Order Ref',
    render: (r) =>
      r.orderRef ? (
        <span className="font-mono text-xs">{r.orderRef}</span>
      ) : (
        <span className="text-slate-400">--</span>
      ),
  },
  {
    key: 'status',
    header: 'Status',
    render: (r) => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
        r.status === 'committed' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
      }`}>
        {r.status}
      </span>
    ),
  },
  { key: 'occurredAt', header: 'Date', sortable: true, render: (r) => formatDateTime(r.occurredAt) },
];

export function TransactionList() {
  const [cursors, setCursors] = useState<string[]>([]);
  const [filterStore, setFilterStore] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [filterAssociate, setFilterAssociate] = useState('');
  const currentCursor = cursors[cursors.length - 1];

  const { data, isLoading } = useTransactions({ cursor: currentCursor, limit: 25 });

  const filteredItems = useMemo(() => {
    let items = data?.items ?? [];
    if (filterStore) items = items.filter((t) => t.storeId === filterStore);
    if (filterSource) items = items.filter((t) => t.sourceChannel === filterSource);
    if (filterAssociate) items = items.filter((t) => t.associateId === filterAssociate);
    return items;
  }, [data?.items, filterStore, filterSource, filterAssociate]);

  const uniqueStores = useMemo(() => {
    const all = data?.items ?? [];
    const stores = new Map<string, string>();
    for (const t of all) {
      if (t.storeId) stores.set(t.storeId, t.storeName ?? t.storeId);
    }
    return Array.from(stores.entries());
  }, [data?.items]);

  const uniqueSources = useMemo(() => {
    const all = data?.items ?? [];
    return [...new Set(all.map((t) => t.sourceChannel).filter(Boolean))] as string[];
  }, [data?.items]);

  const uniqueAssociates = useMemo(() => {
    const all = data?.items ?? [];
    const assocs = new Map<string, string>();
    for (const t of all) {
      if (t.associateId) assocs.set(t.associateId, t.associateName ?? t.associateId);
    }
    return Array.from(assocs.entries());
  }, [data?.items]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Transactions</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={filterStore}
          onChange={(e) => setFilterStore(e.target.value)}
          className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white"
        >
          <option value="">All Stores</option>
          {uniqueStores.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
        <select
          value={filterSource}
          onChange={(e) => setFilterSource(e.target.value)}
          className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white"
        >
          <option value="">All Sources</option>
          {uniqueSources.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={filterAssociate}
          onChange={(e) => setFilterAssociate(e.target.value)}
          className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white"
        >
          <option value="">All Associates</option>
          {uniqueAssociates.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
        {(filterStore || filterSource || filterAssociate) && (
          <button
            onClick={() => { setFilterStore(''); setFilterSource(''); setFilterAssociate(''); }}
            className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 underline"
          >
            Clear filters
          </button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={filteredItems}
        isLoading={isLoading}
        keyExtractor={(r) => r.transactionId}
        hasNextPage={!!data?.nextCursor}
        hasPrevPage={cursors.length > 0}
        onNextPage={() => data?.nextCursor && setCursors((c) => [...c, data.nextCursor!])}
        onPrevPage={() => setCursors((c) => c.slice(0, -1))}
      />
    </div>
  );
}
