import { ConsoleShell } from '../console-shell';
import HistoryList from './history-list';

export default function HistoryPage() {
  return <ConsoleShell active="history"><HistoryList /></ConsoleShell>;
}
