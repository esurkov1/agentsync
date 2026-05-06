import React from "react";

export function PlaceholderPage({ tab }) {
  if (tab === "AGENTS") {
    return (
      <section className="card section-gap">
        <p className="muted">Раздел AGENTS зарезервирован под отдельный функционал.</p>
      </section>
    );
  }
  return (
    <section className="card section-gap">
      <p className="muted">Раздел {tab} будет добавлен следующим шагом.</p>
    </section>
  );
}
