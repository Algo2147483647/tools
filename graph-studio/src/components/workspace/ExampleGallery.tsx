import { EXAMPLE_WORKSPACES } from "../../workspace/examples";

export default function ExampleGallery({ onOpen, busy }: { onOpen: (id: string) => void; busy: boolean }) {
  return (
    <section className="example-gallery" aria-label="Example workspaces">
      <div className="example-grid">
        {EXAMPLE_WORKSPACES.map((example) => (
          <button
            key={example.id}
            className={`example-card example-card--${example.id}`}
            onClick={() => onOpen(example.id)}
            disabled={busy}
            aria-label={`Open ${example.title} workspace`}
          >
            <img
              className="example-art"
              src={`${import.meta.env.BASE_URL}assets/examples/${example.id}.png`}
              alt=""
              width={480}
              height={200}
              loading="lazy"
              decoding="async"
            />
            <span className="example-card-body">
              <span className="eyebrow">{example.kind}</span>
              <strong>{example.title}</strong>
              <span className="example-description">{example.description}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
