import { useState } from 'react'
import { generateLabels } from './utils/label-placement'
import RouteVisualization from './components/RouteVisualization'
import './App.css'

function App() {
  const [routes, setRoutes] = useState('')
  const [labels, setLabels] = useState('')
  const [zoomLevel, setZoomLevel] = useState(1)

  const handleGenerateLabels = () => {
    const generatedLabels = generateLabels(routes)
    setLabels(generatedLabels)
  }

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '5px' }}>Routes:</label>
        <textarea
          value={routes}
          onChange={(e) => setRoutes(e.target.value)}
          style={{ width: '100%', height: '100px', fontFamily: 'monospace' }}
        />
      </div>
      <div style={{ marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
        <button onClick={handleGenerateLabels}>Generate Labels</button>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>Labels:</label>
          <textarea
            value={labels}
            onChange={(e) => setLabels(e.target.value)}
            style={{ width: '100%', height: '100px', fontFamily: 'monospace' }}
          />
        </div>
      </div>
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '5px' }}>Zoom Level:</label>
        <input
          type="number"
          value={zoomLevel}
          onChange={(e) => setZoomLevel(Number(e.target.value))}
          style={{ width: '100px' }}
        />
      </div>
      {routes && labels && (
        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '10px' }}>
          <RouteVisualization routes={routes} labels={labels} zoomLevel={zoomLevel} />
        </div>
      )}
    </div>
  )
}

export default App
