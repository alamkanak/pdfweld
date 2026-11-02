import { useState } from "react";
import { Search, ArrowUpRight, Wrench } from "lucide-react";
import { homeTools, recommendedTools, type HomeTool } from "../lib/home-tools";
import { startHomeTool } from "../lib/actions";
import { Input, NavigationButton, Empty } from "./ui";

export function HomeToolCard({ tool }: { tool: HomeTool }) {
  return (
    <button
      aria-label={`Start ${tool.label}`}
      onClick={() => startHomeTool(tool.id)}
      className="group flex min-h-24 items-start gap-3 rounded-lg border border-white/10 bg-white/[.02] p-3 text-left outline-none hover:border-lime-400/30 hover:bg-white/[.04] focus-visible:ring-2 focus-visible:ring-lime-300"
    >
      <tool.icon
        size={21}
        strokeWidth={1.7}
        className="mt-0.5 shrink-0 text-lime-300"
      />
      <span className="min-w-0 flex-1">
        <strong className="block text-sm font-medium text-studio-200">
          {tool.label}
        </strong>
        <span className="mt-1 block text-xs leading-5 text-studio-400">
          {tool.description}
        </span>
      </span>
      <ArrowUpRight
        size={14}
        className="mt-1 shrink-0 text-studio-600 group-hover:text-lime-300"
      />
    </button>
  );
}
export function RecommendedTools({ onAll }: { onAll: () => void }) {
  return (
    <section
      aria-labelledby="recommended-tools"
      className="mb-3 border-b border-white/10 pb-3"
    >
      <div className="mb-2 flex items-center justify-between">
        <h2
          id="recommended-tools"
          className="text-base font-semibold text-white"
        >
          Start with a tool
        </h2>
        <button
          onClick={onAll}
          className="text-sm text-lime-300 hover:text-lime-400"
        >
          All tools
        </button>
      </div>
      <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 lg:grid-cols-3">
        {recommendedTools.map((tool) => (
          <HomeToolCard key={tool.id} tool={tool} />
        ))}
      </div>
    </section>
  );
}
export function HomeTools() {
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState("All");
  const filtered = homeTools.filter(
    (tool) =>
      (category === "All" || tool.category === category) &&
      `${tool.label} ${tool.description} ${tool.category}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <main
      className="min-h-0 min-w-0 flex-1 overflow-y-auto p-3"
      data-testid="home-tools"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-white">All tools</h1>
          <p className="mt-1 text-xs text-studio-400">
            Choose a task first, then add files. Everything runs on your device.
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search
            size={16}
            className="absolute left-3 top-3.5 text-studio-400"
          />
          <Input
            aria-label="Search home tools"
            placeholder="Find a tool…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>
      <nav aria-label="Tool categories" className="mb-3 flex flex-wrap gap-1">
        {[
          "All",
          "Edit",
          "Organize",
          "Convert",
          "Optimize",
          "Protect",
          "Inspect",
        ].map((item) => (
          <NavigationButton
            key={item}
            active={category === item}
            onClick={() => setCategory(item)}
          >
            {item}
          </NavigationButton>
        ))}
      </nav>
      <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 lg:grid-cols-3">
        {filtered.map((tool) => (
          <HomeToolCard key={tool.id} tool={tool} />
        ))}
      </div>
      {!filtered.length && (
        <Empty icon={<Wrench size={24} />}>No tools match your search.</Empty>
      )}
    </main>
  );
}
