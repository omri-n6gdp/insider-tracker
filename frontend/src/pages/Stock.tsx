import { useParams } from "react-router-dom";

export default function Stock() {
  const { ticker } = useParams();
  return (
    <div className="p-8 font-mono text-text-secondary">
      Stock page for <span className="text-mint font-medium">{ticker}</span> — coming in Phase 2B
    </div>
  );
}
