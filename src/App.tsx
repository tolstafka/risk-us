import { useState } from 'react'
import RiskMap from './mapv2.svg?react'
import './App.css'

function App() {
  const [selectedTerritoryID, setSelectedTerritoryID] = useState("")

  function handleMapClick(e) {
    const target = e.target as Element | null
    if (!target) return

    const territory=target.closest("path[id]")
    if (!territory) return

    const territoryID = territory.getAttribute("id")
    if (!territoryID) return
    
    setSelectedTerritoryID(territoryID)
    console.log(`clicked ${territoryID}`)

  }

  return (
    <>
      <p>selected {selectedTerritoryID}</p>
      <RiskMap onClick={handleMapClick} className="mapSVG"/>
    </>
  )
}

export default App
