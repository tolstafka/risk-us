import { useState, useEffect, useMemo, useRef } from "react";
import RiskMap from "./mapv2.svg?react";
import MiniMap from "./assets/minimap2.svg?react";
import AdjacentNodes from "./FakeData";
import "./App.css";

function App() {
    const [controlledTerritoryIDs, setControlledTerritoryIDs] = useState([
        "Alaska",
        "California",
        "Oregon",
        "Puerto Rico",
        "West Virginia",
    ]);
    const [selectedTerritoryID, setSelectedTerritoryID] = useState("");

    const neighborIDs = useMemo(
        () => Array.from(AdjacentNodes.get(selectedTerritoryID) ?? []),
        [selectedTerritoryID],
    );

    function handleMapClick(e) {
        const target = e.target as Element | null;
        if (!target) return;

        const territory = target.closest("path[id]");
        if (!territory) return;

        const territoryID = territory.getAttribute("id");
        if (!territoryID) return;

        setSelectedTerritoryID(territoryID);
    }

    function toLabelId(territoryId: string) {
        return `Label${territoryId.replace(/\s+/g, "")}`;
    }

    const svgRef = useRef<SVGSVGElement | null>(null);
    const miniMapRef = useRef<SVGSVGElement | null>(null); // add this
    const controlledSet = useMemo(
        () => new Set(controlledTerritoryIDs),
        [controlledTerritoryIDs],
    );

    useEffect(() => {
        const svg = svgRef.current;
        const mini = miniMapRef.current;

        if (!svg || !mini) return;
        const allLabels =
            svg.querySelectorAll<SVGTextElement>('text[id^="Label"]');
        allLabels.forEach((label) => label.removeAttribute("data-highlight"));

        ////////// all territories

        const allTerritories = svg.querySelectorAll<SVGPathElement>("path[id]");
        allTerritories.forEach((path) =>
            path.removeAttribute("data-highlight"),
        );

        ////////// neighbors

        for (const neighborID of neighborIDs) {
            // TERRITORY
            const neighborElement = svg.querySelector<SVGPathElement>(
                `path[id="${CSS.escape(neighborID)}"]`,
            );
            if (neighborElement)
                neighborElement.setAttribute("data-highlight", "neighbor");

            // LABEL
            const neighborLabel = svg.querySelector<SVGTextElement>(
                `#${CSS.escape(toLabelId(neighborID))}`,
            );
            if (neighborLabel)
                neighborLabel.setAttribute("data-highlight", "neighbor");
        }

        ////////// selected

        if (selectedTerritoryID) {
            // TERRITORY
            const selectedElement = svg.querySelector<SVGPathElement>(
                `path[id="${CSS.escape(selectedTerritoryID)}"]`,
            );
            if (selectedElement)
                selectedElement.setAttribute("data-highlight", "selected");

            // LABEL
            const selectedLabel = svg.querySelector<SVGTextElement>(
                `#${CSS.escape(toLabelId(selectedTerritoryID))}`,
            );
            if (selectedLabel)
                selectedLabel.setAttribute("data-highlight", "selected");
        }

        ////////// minimap

        const miniTerritories = mini.querySelectorAll<SVGPathElement>(
            "g#RiskMapV2-2 path[id]",
        );

        miniTerritories.forEach((path) => {
            const id = path.getAttribute("id");
            if (!id) return;

            path.setAttribute(
                "data-control",
                controlledSet.has(id) ? "controlled" : "enemy",
            );
        });
    }, [neighborIDs, selectedTerritoryID, controlledSet]);

    return (
        <main>
            <div className="mapFrame">
              <RiskMap ref={svgRef} onClick={handleMapClick} className="mapSVG" />
              <div className="miniMapFrame">
                <MiniMap ref={miniMapRef} className="miniMapSVG" />
              </div>
            </div>
            <p className="status">{`${selectedTerritoryID.toUpperCase()} ${selectedTerritoryID ? "TERRITORY" : ""}`}</p>
        </main>
    );
}

export default App;
