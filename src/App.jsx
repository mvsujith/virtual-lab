import React, { useState, useCallback } from "react";
import WorkspaceCanvas from "./components/WorkspaceCanvas";
import SubmissionDoc from "./components/SubmissionDoc";

const App = () => {
  const [selected, setSelected] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0, z: 0 });

  const handleSelect = useCallback((isSelected, position) => {
    setSelected(isSelected);
    if (position) setPos(position);
  }, []);

  const handlePositionChange = useCallback((position) => {
    if (position) setPos(position);
  }, []);

  const [activeTab, setActiveTab] = useState('workspace');

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Header */}
      <header className="bg-gray-800 text-white py-2 px-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold">3D Multiple Screens Setup</h1>
          <button
            className={`px-3 py-1 rounded text-sm font-medium shadow-sm ring-1 ring-white/10 transition-colors ${activeTab === 'doc' ? 'bg-blue-500' : 'bg-blue-600 hover:bg-blue-500'}`}
            onClick={() => setActiveTab(activeTab === 'doc' ? 'workspace' : 'doc')}
            title="Click to view the submission document"
          >
            Click Here
          </button>
        </div>
        <div className="text-sm font-mono opacity-90">
          {activeTab === 'workspace' && (
            selected ? (
              <span>
                Position: x={pos.x.toFixed(2)} y={pos.y.toFixed(2)} z={pos.z.toFixed(2)}
              </span>
            ) : (
              <span>Place the pointer on the charts to interact with them</span>
            )
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {activeTab === 'workspace' ? (
          <div className="flex-1 relative">
            <WorkspaceCanvas onSelect={handleSelect} onPositionChange={handlePositionChange} />
          </div>
        ) : (
          <div className="flex-1 bg-gray-900 text-white">
            <SubmissionDoc onClose={() => setActiveTab('workspace')} />
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
