import React from "react";

interface VitalSign {
  name: string;
  value: string;
  unit: string;
  status: "normal" | "warning" | "critical";
}

const App: React.FC = () => {
  const vitalSigns: VitalSign[] = [
    { name: "Heart Rate", value: "72", unit: "bpm", status: "normal" },
    { name: "Blood Pressure", value: "120/80", unit: "mmHg", status: "normal" },
    { name: "Oxygen Saturation", value: "98", unit: "%", status: "normal" },
    { name: "Temperature", value: "36.6", unit: "°C", status: "normal" },
    { name: "Respiratory Rate", value: "16", unit: "bpm", status: "warning" },
  ];

  const quickActions = [
    { icon: "📋", label: "New Patient", path: "/patient-checkin" },
    { icon: "📊", label: "View Readings", path: "/readings" },
    { icon: "⚙️", label: "Settings", path: "/settings" },
    { icon: "📞", label: "Emergency", path: "/emergency" },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="flex justify-between items-center p-8 bg-white/10 backdrop-blur-xl border-b border-white/20">
        <div className="flex items-center gap-4">
          <div className="text-6xl bg-white/20 p-6 rounded-full">📈</div>
          <div>
            <h1 className="text-5xl font-bold">RiseCare</h1>
            <span className="text-xl opacity-90 block">Vital Sign System</span>
          </div>
        </div>
        <div className="text-right">
          <span className="text-xl font-semibold block text-green-400">
            🟢 Online
          </span>
          <span className="text-sm opacity-80">Feb 25, 2026 11:29 PM</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-8 flex flex-col gap-12 overflow-y-auto pb-16">
        {/* Welcome Section */}
        <section className="text-center py-12">
          <h2 className="text-6xl font-bold bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent mb-6">
            Welcome to RiseCare Kiosk
          </h2>
          <p className="text-3xl opacity-90">
            Touch screen to begin vital signs monitoring
          </p>
        </section>

        {/* Live Vital Signs Grid */}
        <section>
          <h3 className="text-4xl font-bold text-center mb-8">Live Readings</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {vitalSigns.map((vital, index) => (
              <div
                key={index}
                className={`
                  vital-card flex items-center gap-6 p-8 rounded-3xl backdrop-blur-xl border border-white/20
                  hover:-translate-y-2 hover:bg-white/25 transition-all duration-300 cursor-pointer
                  ${vital.status === "normal" && "bg-green-500/20"}
                  ${vital.status === "warning" && "bg-yellow-500/20"}
                  ${vital.status === "critical" && "bg-red-500/20"}
                `}
              >
                <div className="text-5xl">📊</div>
                <div className="flex-1">
                  <div className="text-lg opacity-90 mb-2">{vital.name}</div>
                  <div className="text-5xl font-bold">
                    {vital.value}{" "}
                    <span className="text-3xl font-normal opacity-80">
                      {vital.unit}
                    </span>
                  </div>
                </div>
                <div
                  className={`
                  w-6 h-6 rounded-full
                  ${vital.status === "normal" && "bg-green-400"}
                  ${vital.status === "warning" && "bg-yellow-400"}
                  ${vital.status === "critical" && "bg-red-400"}
                `}
                ></div>
              </div>
            ))}
          </div>
        </section>

        {/* Quick Actions */}
        <section>
          <h3 className="text-4xl font-bold text-center mb-10">
            Quick Actions
          </h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {quickActions.map((action, index) => (
              <button
                key={index}
                className="
                  action-button flex flex-col items-center gap-4 p-10 rounded-3xl
                  bg-white/20 backdrop-blur-xl border-2 border-white/30
                  hover:bg-white/30 hover:scale-105 hover:border-white/50
                  transition-all duration-300 font-semibold text-xl
                  active:scale-95
                "
              >
                <span className="text-6xl">{action.icon}</span>
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="p-6 bg-black/20 text-center text-lg opacity-90">
        Touch anywhere to continue | Kiosk Mode Active
      </footer>
    </div>
  );
};

export default App;
