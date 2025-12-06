import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <main className="p-8 flex flex-col gap-8 max-w-4xl mx-auto">
      <h1 className="text-4xl font-bold">grabient-ops</h1>
      <p className="text-lg text-gray-600">
        Palette tagging pipeline with Convex workflows.
      </p>

      <div className="grid gap-4">
        <StatusCard title="Palettes" description="Seed palettes from D1" />
        <StatusCard title="Images" description="Generate palette images to R2" />
        <StatusCard
          title="Stage 1: Tagging"
          description="Multi-model tag generation"
        />
        <StatusCard
          title="Stage 2: Refinement"
          description="Opus 4.5 tag refinement"
        />
      </div>
    </main>
  );
}

function StatusCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="border rounded-lg p-4 bg-white dark:bg-slate-800">
      <h2 className="font-semibold">{title}</h2>
      <p className="text-sm text-gray-500">{description}</p>
    </div>
  );
}
