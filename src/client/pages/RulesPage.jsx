import React from "react";
import { SectionHeader } from "../components/SectionHeader";
import { Button } from "../components/Button";
import { RuleCard } from "../components/RuleCard";

export function RulesPage({ rules, previews, syncStatus, onOpenRule, onAddRule, onSyncAll, busy, toSummary }) {
  return (
    <section className="card section-gap">
      <SectionHeader title="Rules">
        <Button onClick={onAddRule} disabled={busy}>
          Добавить
        </Button>
        <Button className="primary" onClick={onSyncAll} disabled={busy}>
          Синхронизировать
        </Button>
      </SectionHeader>

      <div className="rule-cards">
        {rules.map((rule) => (
          <RuleCard
            key={rule.id}
            rule={rule}
            preview={previews[rule.id]}
            syncSummary={toSummary(syncStatus[rule.id])}
            onOpen={onOpenRule}
          />
        ))}
      </div>
    </section>
  );
}
