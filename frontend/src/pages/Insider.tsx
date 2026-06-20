import { useParams } from "react-router-dom";

export default function Insider() {
  const { cik } = useParams();
  return (
    <div className="p-8 font-mono text-text-secondary">
      Insider page for CIK <span className="text-coral font-medium">{cik}</span> — coming in Phase 2B
    </div>
  );
}
