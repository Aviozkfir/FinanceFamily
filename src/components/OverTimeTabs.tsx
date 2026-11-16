import { useNavigate } from 'react-router-dom';
import { useL } from '../lib/store';
import { Segmented } from './ui';

/** The two views of the "Over time" tab: the list of months, and their trends. */
export default function OverTimeTabs({ value }: { value: 'months' | 'trends' }) {
  const L = useL();
  const navigate = useNavigate();
  return (
    <div className="mb-4">
      <Segmented value={value} onChange={(v) => navigate(v === 'months' ? '/history' : '/trends')}
        options={[{ value: 'months', label: L('החודשים שלי', 'My months') }, { value: 'trends', label: L('מגמות ותחזית', 'Trends & forecast') }]} />
    </div>
  );
}
