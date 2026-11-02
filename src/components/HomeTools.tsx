import { useState } from "react";
import { ChevronRight, Wrench } from "lucide-react";
import { homeTools, recommendedTools, type HomeTool } from "../lib/home-tools";
import { startHomeTool } from "../lib/actions";
import { Button, SearchField, NavigationButton, Empty } from "./ui";
import { PaneToolbar, PaneSectionHeader } from "./PaneLayout";
import { followTool } from "../seo/PublicContent";
import { toolPath } from "../seo/pages";

export function HomeToolCard({ tool }: { tool: HomeTool }) {
  return (
    <a
      aria-label={`Start ${tool.label}`}
      href={toolPath(tool.id)}
      onClick={(event) => followTool(event, tool.id, startHomeTool)}
      className="group flex items-start gap-3 rounded-lg border border-white/10 bg-white/[.02] p-3 text-left outline-none hover:border-lime-400/30 hover:bg-white/[.04] focus-visible:ring-2 focus-visible:ring-lime-300"
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
    </a>
  );
}
export function RecommendedTools({ onAll }: { onAll: () => void }) {
  return (
    <section
      aria-labelledby="recommended-tools"
      className="border-b border-white/10"
    >
      <PaneSectionHeader>
        <h2
          id="recommended-tools"
          className="text-base font-semibold text-white"
        >
          Start with a tool
        </h2>
        <Button onClick={onAll}>
          All tools
          <ChevronRight size={16} />
        </Button>
      </PaneSectionHeader>
      <div className="grid grid-cols-1 gap-2 px-3 pb-3 min-[360px]:grid-cols-2 lg:grid-cols-3">
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
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      data-testid="home-tools"
    >
      <PaneToolbar className="justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">All tools</h1>
          <p className="mt-1 text-xs text-studio-400">
            Choose a task first, then add files. Everything runs on your device.
          </p>
        </div>
        <SearchField
          aria-label="Search home tools"
          placeholder="Find a tool…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full sm:w-64"
          compact
        />
      </PaneToolbar>
      <PaneToolbar
        as="nav"
        wrap={false}
        aria-label="Tool categories"
        className="overflow-x-auto"
      >
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
      </PaneToolbar>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 lg:grid-cols-3">
          {filtered.map((tool) => (
            <HomeToolCard key={tool.id} tool={tool} />
          ))}
        </div>
        {!filtered.length && (
          <Empty icon={<Wrench size={24} />}>No tools match your search.</Empty>
        )}
      </div>
    </main>
  );
}
