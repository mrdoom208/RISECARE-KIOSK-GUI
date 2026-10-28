import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { VirtualKeyboard } from "@/components/VirtualKeyboard";
import { VirtualKeyboardProvider } from "@/hooks/use-virtual-keyboard";
import IdleTimeout from "@/components/IdleTimeout";
import { LockScreen } from "@/components/LockScreen";
import { SwipeReload } from "@/components/SwipeReload";
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

// The kiosk UI talks to its local API and sensor services. Turning off Wi-Fi
// must not make TanStack Query pause local reads and commands based on the
// browser's navigator.onLine state.
onlineManager.setEventListener((setOnline) => {
  setOnline(true);
  return () => {};
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
              <SwipeReload>
                <Router />
                <VirtualKeyboard />
                <IdleTimeout />
                <LockScreen />
              </SwipeReload>
            </VirtualKeyboardProvider>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </div>
  );
}

export default App;
