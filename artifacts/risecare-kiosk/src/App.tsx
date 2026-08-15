import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { VirtualKeyboard } from "@/components/VirtualKeyboard";
import { VirtualKeyboardProvider } from "@/hooks/use-virtual-keyboard";
import IdleTimeout from "@/components/IdleTimeout";
// Pages
import Home from "./pages/Home";
import Register from "./pages/Register";
import FindSession from "./pages/FindSession";
import Dashboard from "./pages/Dashboard";
import Results from "./pages/Results";
import History from "./pages/History";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  const [location] = useLocation();

  return (
    <div key={location}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/register" component={Register} />
        <Route path="/find-session" component={FindSession} />
        <Route path="/history" component={History} />
        <Route path="/results" component={Results} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/:rest*" component={NotFound} />
      </Switch>
    </div>
  );
}

function App() {
  return (
    <div onContextMenu={(event) => event.preventDefault()}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter>
            <VirtualKeyboardProvider>
              <Router />
              <VirtualKeyboard />
              <IdleTimeout />
            </VirtualKeyboardProvider>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </div>
  );
}

export default App;
