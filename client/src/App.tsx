import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import Chat from "@/pages/chat";
import Welcome from "@/pages/welcome";
import NotFound from "@/pages/not-found";
import Activities from "@/pages/activities";
import ActivityDetails from "@/pages/activity-details";
import Conversations from "@/pages/conversations";
import Navbar from "@/components/Navbar";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Welcome} />
      <Route path="/chat" component={Chat} />
      <Route path="/chat/:id" component={Chat} />
      <Route path="/activities" component={Activities} />
      <Route path="/activity/:id" component={ActivityDetails} />
      <Route path="/conversations" component={Conversations} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-background text-foreground">
        <Navbar />
        <Router />
      </div>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;