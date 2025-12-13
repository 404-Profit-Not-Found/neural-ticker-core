import { useEffect, useRef, useState, type ComponentType } from 'react';
import {
  Activity,
  ArrowUpRight,
  BadgeCheck,
  BellRing,
  CheckCircle2,
  LayoutGrid,
  Palette,
  PanelsTopLeft,
  Sparkles,
  Table,
  Wand2
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { InlineAlert } from '../components/ui/inline-alert';
import { NativeSelect } from '../components/ui/select-native';
import {
  Table as UiTable,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell
} from '../components/ui/table';
import { useToast } from '../components/ui/toast';
import { cn } from '../lib/utils';

const colorTokens = [
  { name: 'Primary', token: '--primary', usage: 'Actions, focus rings, links', swatch: 'rgb(var(--primary))' },
  { name: 'Foreground', token: '--foreground', usage: 'Body text, icons', swatch: 'rgb(var(--foreground))' },
  { name: 'Muted', token: '--muted', usage: 'Surfaces, table rows, inputs', swatch: 'rgb(var(--muted))' },
  { name: 'Accent', token: '--accent', usage: 'Hover states, subtle fills', swatch: 'rgb(var(--accent))' },
  { name: 'Destructive', token: '--destructive', usage: 'Errors, destructive flows', swatch: 'rgb(var(--destructive))' },
];

const spacingScale = [
  { label: 'Tight', value: 4 },
  { label: 'Cozy', value: 8 },
  { label: 'Base', value: 12 },
  { label: 'Roomy', value: 16 },
  { label: 'Section', value: 24 },
  { label: 'Page', value: 32 },
];

const sampleTable = [
  { symbol: 'AAPL', status: 'Strong Buy', price: 227.12, change: 1.8, volume: '54.2M' },
  { symbol: 'MSFT', status: 'Buy', price: 413.45, change: 0.6, volume: '32.1M' },
  { symbol: 'NVDA', status: 'Hold', price: 119.23, change: -0.9, volume: '18.4M' },
];

export function StyleGuidePage() {
  const { showToast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewTheme, setPreviewTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'dark');
  const originalTheme = useRef<string | null>(document.documentElement.getAttribute('data-theme'));

  const positiveSwatch = 'linear-gradient(135deg, rgba(34,197,94,0.2), rgba(59,130,246,0.15))';

  useEffect(() => {
    const applyTheme = (theme: string) => {
      let nextTheme = theme;
      if (nextTheme.startsWith('g')) nextTheme = 'dark';
      if (!['light', 'dark', 'rgb'].includes(nextTheme)) nextTheme = 'dark';

      document.documentElement.setAttribute('data-theme', nextTheme);
      document.documentElement.classList.remove('theme-light', 'theme-dark', 'theme-rgb');
      document.documentElement.classList.add(`theme-${nextTheme}`);

      if (nextTheme === 'rgb' || nextTheme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    const initialTheme = originalTheme.current;
    applyTheme(previewTheme);

    return () => {
      if (initialTheme) {
        applyTheme(initialTheme);
      }
    };
  }, [previewTheme]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />

      <main className="container mx-auto max-w-[90rem] px-4 py-8 space-y-10">
        <section className="style-hero rgb-border relative overflow-hidden rounded-lg border border-border bg-card p-8">
          <div
            className="style-hero-blob absolute inset-0 pointer-events-none"
            aria-hidden
          />
          <div
            className="style-hero-grid absolute inset-0 pointer-events-none"
            aria-hidden
          />
          <div className="absolute inset-x-8 bottom-6 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-70" />

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-4 max-w-3xl">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Palette className="w-4 h-4 text-primary" />
                <span>Settings / Style Language</span>
              </div>
              <div className="flex items-center gap-3">
                <Sparkles className="w-10 h-10 text-primary" />
                <div>
                  <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Neural Ticket UI Library</h1>
                  <p className="text-sm md:text-base text-muted-foreground mt-1">
                    A single source of truth for patterns, tokens, and components so every screen feels cohesive.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant="default">Tokens</Badge>
                <Badge variant="secondary">Components</Badge>
                <Badge variant="strongBuy">States &amp; Feedback</Badge>
                <Badge variant="purple">Layouts</Badge>
              </div>
            </div>

            <div className="flex flex-col gap-3 items-start">
              <Button
                variant="secondary"
                className="group w-full justify-between text-primary hover:bg-primary/10"
                onClick={() => showToast('Primary actions are `Button` default; use `secondary` for supporting actions.', 'info')}
              >
                Trigger demo toast
                <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Button>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                One canonical look for actions, cards, tables, and tags.
              </div>
            </div>
          </div>

          <div className="relative mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatPill icon={BadgeCheck} label="Tokens locked" value="12" tone="primary" />
            <StatPill icon={PanelsTopLeft} label="Components" value="9" tone="muted" />
            <StatPill icon={Table} label="Data patterns" value="3" tone="accent" />
            <StatPill icon={BellRing} label="Feedback states" value="4" tone="emerald" />
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-semibold">Foundations</h2>
            <p className="text-sm text-muted-foreground">Tokens and rules that every surface, text, and interaction inherits.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Card rgb>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="w-5 h-5 text-primary" />
                  Color system
                </CardTitle>
                <CardDescription>Use semantic tokens—never raw hex—so light/dark themes stay aligned.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {colorTokens.map((color) => (
                  <div key={color.token} className="flex items-center justify-between rounded-lg border border-border bg-background/50 px-3 py-2">
                    <div className="flex items-center gap-3">
                      <span
                        className="h-10 w-10 rounded-md border border-border shadow-sm"
                        style={{ background: color.swatch }}
                        aria-hidden
                      />
                      <div>
                        <p className="text-sm font-medium">{color.name}</p>
                        <p className="text-xs text-muted-foreground">{color.usage}</p>
                      </div>
                    </div>
                    <code className="text-[11px] text-muted-foreground">{color.token}</code>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="rgb-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LayoutGrid className="w-5 h-5 text-primary" />
                  Typography &amp; rhythm
                </CardTitle>
                <CardDescription>Pair hierarchy with breathing room to keep dense data legible.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-1">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Heading / Display</p>
                  <p className="text-2xl font-semibold">Alpha score momentum</p>
                  <p className="text-sm text-muted-foreground">Use for titles, KPI labels, and section headers.</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-1">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Body</p>
                  <p className="text-sm leading-relaxed">
                    Default body is 14px/20px. Use 12px for metadata and helper text, and mono only for numbers or code.
                  </p>
                  <code className="block text-[12px] text-muted-foreground">font-sans · font-semibold for emphasis</code>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PanelsTopLeft className="w-5 h-5 text-primary" />
                  Spacing, radii, elevation
                </CardTitle>
                <CardDescription>Consistent padding and radius keeps cards and tiles aligned.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {spacingScale.map((scale) => (
                    <Badge key={scale.value} className="bg-muted text-foreground border-border">
                      {scale.label}: {scale.value}px
                    </Badge>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                    <p className="text-xs text-muted-foreground mb-2">Radius</p>
                    <div className="h-10 rounded-lg bg-primary/10 border border-primary/30" />
                    <p className="mt-2 text-[11px] text-muted-foreground">var(--radius)</p>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-4 shadow-md">
                    <p className="text-xs text-muted-foreground mb-2">Shadow</p>
                    <div className="h-10 rounded-lg border border-border bg-gradient-to-br from-foreground/5 to-transparent" />
                    <p className="mt-2 text-[11px] text-muted-foreground">Use soft shadows, no hard borders</p>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-4 shadow-lg">
                    <p className="text-xs text-muted-foreground mb-2">Grid</p>
                    <div className="h-10 rounded-lg bg-[radial-gradient(circle,_rgba(255,255,255,0.08)_1px,_transparent_1px)] bg-[length:12px_12px]" />
                    <p className="mt-2 text-[11px] text-muted-foreground">8 / 12 px rhythm</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-semibold">Component Library</h2>
            <p className="text-sm text-muted-foreground">Canonically-styled building blocks for every screen.</p>
          </div>

          <Tabs defaultValue="actions" className="w-full">
            <TabsList>
              <TabsTrigger value="actions">Actions &amp; forms</TabsTrigger>
              <TabsTrigger value="data">Data display</TabsTrigger>
              <TabsTrigger value="lists">Lists & Feeds</TabsTrigger>
              <TabsTrigger value="feedback">Feedback &amp; states</TabsTrigger>
            </TabsList>

            <TabsContent value="actions">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Card rgb>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Wand2 className="w-5 h-5 text-primary" />
                      Buttons
                    </CardTitle>
                    <CardDescription>Use `default` for primary, `secondary` for supporting, `outline` for minimal.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-3">
                      <Button>Primary</Button>
                      <Button variant="secondary">Secondary</Button>
                      <Button variant="outline">Outline</Button>
                      <Button variant="ghost">Ghost</Button>
                      <Button variant="destructive">Destructive</Button>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button size="sm">Compact</Button>
                      <Button size="lg" className="px-6">Large</Button>
                      <Button size="icon" variant="secondary" aria-label="Icon button">
                        <ArrowUpRight className="w-4 h-4" />
                      </Button>
                      <span className="text-xs text-muted-foreground">Min tap target 40x40, use `px-4 py-2` for default density.</span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="rgb-border">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="w-5 h-5 text-primary" />
                      Inputs
                    </CardTitle>
                    <CardDescription>Default inputs use muted surfaces, 2px primary focus ring, 12px radius.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Label</label>
                      <input
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/60"
                        placeholder="Ticker or company"
                      />
                      <p className="text-xs text-muted-foreground">Helper text sits at 12px/18px.</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="relative">
                        <NativeSelect
                          value={previewTheme}
                          onChange={(e) => setPreviewTheme(e.target.value)}
                        >
                          <option value="dark">Theme: Dark</option>
                          <option value="light">Theme: Light</option>
                          <option value="rgb">Theme: RGB</option>
                        </NativeSelect>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" className="flex-1">
                          Toggle chip
                        </Button>
                        <Button variant="secondary" className="flex-1 bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20">
                          Selected
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BadgeCheck className="w-5 h-5 text-primary" />
                      Tags &amp; statuses
                    </CardTitle>
                    <CardDescription>Use semantic badges for states and data categories.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <Badge>Default</Badge>
                      <Badge variant="secondary">Secondary</Badge>
                      <Badge variant="outline">Outline</Badge>
                      <Badge variant="strongBuy">Strong Buy</Badge>
                      <Badge variant="buy">Buy</Badge>
                      <Badge variant="hold">Hold</Badge>
                      <Badge variant="sell">Sell</Badge>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/10 p-3 text-xs text-muted-foreground">
                      Use rounded-full badges for metadata, filters, and inline states. Keep to short labels &lt;12 characters.
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="data">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <PanelsTopLeft className="w-5 h-5 text-primary" />
                      Tiles &amp; cards
                    </CardTitle>
                    <CardDescription>Surfaces use `bg-card`, `border-border`, 20–24px padding.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-1 gap-3">
                      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                        <div className="flex items-center justify-between">
                          <div className="text-sm text-muted-foreground">Alpha Score</div>
                          <Badge variant="strongBuy" className="[data-theme=light]:text-black px-3 py-1">+12.3%</Badge>
                        </div>
                        <p className="mt-2 text-2xl font-semibold text-foreground">Momentum</p>
                        <p className="text-xs text-muted-foreground">Use for KPI tiles and quick stats.</p>
                      </div>
                      <div className="rounded-lg border border-border bg-card p-4 shadow-md rgb-border">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-muted-foreground">Portfolio health</p>
                            <p className="text-xl font-semibold">Stable</p>
                          </div>
                          <Badge variant="strongBuy" className="[data-theme=light]:text-black px-3 py-1 font-semibold" style={{ background: positiveSwatch }}>
                            Low risk
                          </Badge>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                          <span>Volatility</span>
                          <span className="text-foreground text-right">Moderate</span>
                          <span>Drawdown</span>
                          <span className="text-foreground text-right">-3.2%</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="xl:col-span-2">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Table className="w-5 h-5 text-primary" />
                      Table pattern
                    </CardTitle>
                    <CardDescription>Compact density, zebra rows, hover highlight, and right-aligned numbers.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <UiTable>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Symbol</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Price</TableHead>
                          <TableHead className="text-right">Change</TableHead>
                          <TableHead className="text-right">Volume</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sampleTable.map((row) => (
                          <TableRow key={row.symbol}>
                            <TableCell className="font-semibold">{row.symbol}</TableCell>
                            <TableCell>
                              <Badge variant={mapStatusToVariant(row.status)}>{row.status}</Badge>
                            </TableCell>
                            <TableCell className="text-right text-foreground">${row.price.toFixed(2)}</TableCell>
                            <TableCell className={cn('text-right font-medium', row.change >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                              {row.change >= 0 ? '+' : ''}
                              {row.change.toFixed(1)}%
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">{row.volume}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </UiTable>
                    <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                      <span>Showing 5 of 24 instruments</span>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="h-7 text-xs">Previous</Button>
                        <Button variant="outline" size="sm" className="h-7 text-xs">Next</Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Columns align on a 12px grid. Keep headers left-aligned except numeric data, which should be right-aligned.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="lists">
              <div className="grid gap-4 md:grid-cols-2">
                <Card className="h-full flex flex-col overflow-hidden">
                  <CardHeader className="py-4 border-b border-border bg-muted/10">
                    <div className="flex items-center justify-between">
                      <CardTitle className="font-bold text-sm flex items-center gap-2">
                        Research Feed Pattern
                      </CardTitle>
                      <Badge variant="outline" className="text-[10px]">LIVE DEMO</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y divide-border/50">
                      {[1, 2].map((i) => (
                        <div key={i} className="group flex items-center justify-between p-4 hover:bg-muted/50 transition-colors cursor-pointer">
                          <div className="flex items-center gap-4">
                            <div className={cn("w-2 h-2 rounded-full", i === 1 ? "bg-green-500" : "bg-yellow-500 animate-pulse")} />
                            <div>
                              <div className="text-sm font-semibold group-hover:text-primary transition-colors">
                                {i === 1 ? "AAPL: Deep Dive Analysis" : "NVDA: Q3 Earnings Preview"}
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs text-muted-foreground">12/12/2025</span>
                                <span className="text-xs text-muted-foreground">•</span>
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  By <span className="font-medium text-foreground">Local Idiot</span>
                                </span>
                                <span className="px-1.5 py-0.5 rounded-sm bg-muted text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                  {i === 1 ? "gemini-2.0-flash" : "processing"}
                                </span>
                              </div>
                            </div>
                          </div>
                          <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                            <ArrowUpRight className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card className="h-full flex flex-col overflow-hidden">
                  <CardHeader className="py-4 border-b border-border bg-muted/10">
                    <div className="flex items-center justify-between">
                      <CardTitle className="font-bold text-sm flex items-center gap-2">
                        News Feed Pattern
                      </CardTitle>
                      <Badge variant="outline" className="text-[10px]">LIVE DEMO</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y divide-border/50">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="group p-4 hover:bg-muted/50 transition-colors cursor-pointer">
                          <div className="flex gap-3">
                            <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                            <div className="space-y-1">
                              <div className="text-sm font-medium leading-snug group-hover:text-primary transition-colors">
                                {i === 1 ? "Capricor Therapeutics Discusses HOPE-3 Phase III Top Line Data" :
                                  i === 2 ? "Analyst Upgrade: CAPR set to outperform market expectations" :
                                    "FDA Grant: New orphan drug designation received"}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-muted-foreground">10/12/2025</span>
                                <span className="text-[10px] uppercase font-bold tracking-wider text-blue-500 bg-blue-500/10 px-1.5 py-0.5 rounded">
                                  SeekingAlpha
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="feedback">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BellRing className="w-5 h-5 text-primary" />
                      Toasts &amp; inline alerts
                    </CardTitle>
                    <CardDescription>Use `useToast` for transient feedback; inline alerts for persistent context.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => showToast('Saved to your workspace', 'success')}>Success toast</Button>
                      <Button size="sm" variant="outline" onClick={() => showToast('Connection hiccup, retrying...', 'info')}>Info toast</Button>
                    </div>
                    <InlineAlert variant="success">
                      Successful action stays inline when users need context.
                    </InlineAlert>
                    <InlineAlert variant="error">
                      Errors should explain the next step, not just what failed.
                    </InlineAlert>
                  </CardContent>
                </Card>

                <Card rgb>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-primary" />
                      Dialogs
                    </CardTitle>
                    <CardDescription>Keep modals light; primary action on the right, secondary outlined.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Button onClick={() => setDialogOpen(true)}>Open dialog</Button>
                    <p className="text-xs text-muted-foreground">
                      Use for confirmations or detail drill-ins. Prefer inline expansion for simple edits.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <LayoutGrid className="w-5 h-5 text-primary" />
                      States &amp; density
                    </CardTitle>
                    <CardDescription>Hover, focus, loading, and empty states should feel deliberate.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-lg border border-border bg-muted/10 p-3">
                        <p className="text-xs text-muted-foreground">Hover</p>
                        <p className="font-medium">Use `bg-primary/5` + smooth transition.</p>
                      </div>
                      <div className="rounded-lg border border-border bg-muted/10 p-3">
                        <p className="text-xs text-muted-foreground">Focus</p>
                        <p className="font-medium">2px ring in primary, 2px offset.</p>
                      </div>
                      <div className="rounded-lg border border-border bg-muted/10 p-3">
                        <p className="text-xs text-muted-foreground">Loading</p>
                        <p className="font-medium">Skeletons &gt; spinners; keep height fixed.</p>
                      </div>
                      <div className="rounded-lg border border-border bg-muted/10 p-3">
                        <p className="text-xs text-muted-foreground">Empty</p>
                        <p className="font-medium">Use icon + helper text, never a blank area.</p>
                      </div>
                    </div>
                    <div className="rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
                      Use `space-y-3` / `gap-3` inside cards; `px-4 py-2` for rows; `p-6` for full-width sections.
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </section>
      </main>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <div className="bg-card">
          <DialogHeader>
            <DialogTitle>Confirm destructive action</DialogTitle>
            <DialogDescription>Use destructive styling sparingly and pair with clear consequences.</DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex flex-col gap-3">
            <div className="rounded-lg border border-border bg-muted/10 p-3 text-sm">
              Archive removes the item from dashboards but keeps history. You can restore anytime.
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={() => setDialogOpen(false)}>Archive</Button>
            </div>
          </div>
        </div>
      </Dialog>
    </div >
  );
}

function StatPill({
  icon: Icon,
  label,
  value,
  tone = 'muted'
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone?: 'primary' | 'muted' | 'accent' | 'emerald';
}) {
  const gradients: Record<string, string> = {
    primary: 'linear-gradient(90deg, #22d3ee, #2563eb)',
    muted: 'linear-gradient(90deg, #a855f7, #6366f1)',
    accent: 'linear-gradient(90deg, #6366f1, #a855f7)',
    emerald: 'linear-gradient(90deg, #22c55e, #14b8a6)',
  };

  const iconColors: Record<string, string> = {
    primary: 'text-blue-600 dark:text-blue-400',
    muted: 'text-purple-600 dark:text-purple-300',
    accent: 'text-indigo-600 dark:text-indigo-300',
    emerald: 'text-emerald-600 dark:text-emerald-300',
  };

  return (
    <div
      className={cn(
        'style-kpi relative overflow-hidden rounded-md border px-4 py-3',
      )}
      style={{
        background:
          'linear-gradient(rgb(var(--card)), rgb(var(--card))) padding-box, ' +
          `${gradients[tone] || gradients.primary} border-box`,
      }}
    >
      <div
        className="style-kpi-grid absolute inset-0 opacity-25 pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.2) 1px, transparent 1px)',
          backgroundSize: '18px 18px'
        }}
        aria-hidden
      />
      <div className="relative z-10 flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold text-foreground leading-tight">{value}</p>
        </div>
        <Icon className={cn('w-5 h-5', iconColors[tone])} />
      </div>
    </div>
  );
}

function mapStatusToVariant(status: string) {
  if (status.toLowerCase().includes('strong')) return 'strongBuy';
  if (status.toLowerCase() === 'buy') return 'buy';
  if (status.toLowerCase() === 'hold') return 'hold';
  if (status.toLowerCase() === 'sell') return 'sell';
  return 'secondary';
}
