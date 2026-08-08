import { useState, useRef, useEffect } from 'react';
import { Terminal, Send, Trash2, XCircle } from 'lucide-react';

export function MobileTerminal({ telemetry, sendCommand }: any) {
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  
  const history = telemetry?.ctrMessages || [];

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  const handleExecute = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim()) return;

    const cmd = input.trim();
    
    // Simulate validation and execution
    if (cmd.toLowerCase() === 'clear') {
      sendCommand('execute_console_command', { command: 'clear' });
    } else {
      sendCommand('execute_console_command', { command: cmd });
    }
    
    setInput('');
  };

  return (
    <div className="p-4 h-full flex flex-col">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold text-cyan-400 uppercase tracking-widest flex items-center gap-2">
          <Terminal className="w-6 h-6" /> Console
        </h2>
        <div className="flex gap-2">
          <button onClick={() => sendCommand('stop_execution')} className="p-2 bg-red-500/20 text-red-400 rounded hover:bg-red-500/40">
            <XCircle className="w-4 h-4" />
          </button>
          <button onClick={() => sendCommand('execute_console_command', { command: 'clear' })} className="p-2 bg-white/10 text-gray-400 rounded hover:bg-white/20">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Terminal Output */}
      <div className="flex-1 bg-black border border-white/10 rounded-xl p-3 overflow-y-auto font-mono text-xs space-y-2 mb-4">
        {history.map((log: any, i: number) => (
          <div key={i} className="flex gap-2">
            <span className="text-gray-600 shrink-0">[{new Date().toLocaleTimeString()}]</span>
            <span className={
              log.sender === 'user' ? 'text-white' : 'text-cyan-400'
            }>
              {log.sender === 'user' ? '> ' : ''}{log.text}
            </span>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Input Form */}
      <form onSubmit={handleExecute} className="flex gap-2">
        <input 
          type="text" 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter command..."
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm font-mono text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
        />
        <button 
          type="submit"
          className="bg-cyan-500 hover:bg-cyan-400 text-black p-3 rounded-lg flex items-center justify-center transition-colors"
        >
          <Send className="w-5 h-5" />
        </button>
      </form>
    </div>
  );
}
