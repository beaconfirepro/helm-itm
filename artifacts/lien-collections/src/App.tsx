import { Switch, Route, Redirect, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/components/nav/AppShell";
import NotFound from "@/pages/not-found";
import DashboardPage from "@/pages/dashboard";
import HomePage from "@/pages/home";
import ConfigPage from "@/pages/config";
import ProjectDetailPage from "@/pages/project-detail";
import VendorHoldsPage from "@/pages/vendor-holds";
import CollectionsPage from "@/pages/collections";
import AccountDetailPage from "@/pages/account-detail";
import SendQueuePage from "@/pages/send-queue";
import WaiversPage from "@/pages/waivers";
import FilingWorkspacePage from "@/pages/filing-workspace";
import ProfilePage from "@/pages/profile";
import UsersPage from "@/pages/users";
import LiensPage from "@/pages/liens-board";

const queryClient = new QueryClient();

function Router() {
  return (
    <AppShell>
      <Switch>
        <Route path="/" component={DashboardPage} />
        <Route path="/liens" component={HomePage} />
        <Route path="/liens-board" component={LiensPage} />
        <Route path="/projects/:id" component={ProjectDetailPage} />
        <Route path="/holds" component={VendorHoldsPage} />
        <Route path="/collections" component={CollectionsPage} />
        <Route path="/collections/:accountId" component={AccountDetailPage} />
        <Route path="/notices" component={SendQueuePage} />
        <Route path="/send-queue" component={SendQueuePage} />
        <Route path="/waivers" component={WaiversPage} />
        <Route path="/filing/:streamId" component={FilingWorkspacePage} />
        <Route path="/filing">
          <Redirect to="/liens?view=streams" />
        </Route>
        <Route path="/settings" component={ConfigPage} />
        <Route path="/profile" component={ProfilePage} />
        <Route path="/team" component={UsersPage} />
        <Route component={NotFound} />
      </Switch>
    </AppShell>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
