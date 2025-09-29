import React, { useState, useCallback } from "react";
import WorkspaceCanvas from "./components/WorkspaceCanvas";

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

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Header */}
      <header className="bg-gray-800 text-white py-2 px-4 flex justify-between items-center">
        <h1 className="text-xl font-semibold">3D Multiple Screens Setup</h1>
        <div className="text-sm font-mono opacity-90">
          {selected ? (
            <span>
              Position: x={pos.x.toFixed(2)} y={pos.y.toFixed(2)} z={pos.z.toFixed(2)}
            </span>
          ) : (
            <span>Place the pointer on the charts to interact with them</span>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* 3D Workspace */}
        <div className="flex-1 relative">
          <WorkspaceCanvas onSelect={handleSelect} onPositionChange={handlePositionChange} />
        </div>
      </div>
    </div>
  );
};

export default App;
