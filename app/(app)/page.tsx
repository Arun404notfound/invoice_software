import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Revenue, receivables, and aging summaries land here in a later
          delivery step.
        </p>
      </div>
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base font-medium text-muted-foreground">
            Coming soon
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Clients and invoices aren&apos;t built yet — start by filling in
          your business profile under Settings.
        </CardContent>
      </Card>
    </div>
  );
}
