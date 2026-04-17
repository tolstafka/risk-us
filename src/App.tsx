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

    const clickSoundRef = useRef<HTMLAudioElement | null>(null);
    useEffect(() => {
        clickSoundRef.current = new Audio("/src/assets/click.wav");
    }, []);

    // Zoom/pan state
    const mapFrameRef = useRef<HTMLDivElement>(null);
    const transformRef = useRef({ scale: 1, x: 0, y: 0 });
    const [, forceUpdate] = useState(0);
    const isDragging = useRef(false);
    const hasDragged = useRef(false);
    const dragStart = useRef({ x: 0, y: 0 });
    const mouseDownPos = useRef({ x: 0, y: 0 });

    useEffect(() => {
        const el = mapFrameRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const { scale, x, y } = transformRef.current;
            const minZoom = 0.9;
            const maxZoom = 5;
            const zoomSpeed = 1.015;
            const factor = e.deltaY < 0 ? zoomSpeed : 1 / zoomSpeed;
            const newScale = Math.min(Math.max(scale * factor, minZoom), maxZoom);
            const rect = el.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            transformRef.current = {
                scale: newScale,
                x: mx - (mx - x) * (newScale / scale),
                y: my - (my - y) * (newScale / scale),
            };
            forceUpdate((n) => n + 1);
        };
        el.addEventListener("wheel", onWheel, { passive: false });
        return () => el.removeEventListener("wheel", onWheel);
    }, []);

    function handleMouseDown(e: React.MouseEvent) {
        if (e.button !== 0) return;
        isDragging.current = true;
        hasDragged.current = false;
        mouseDownPos.current = { x: e.clientX, y: e.clientY };
        dragStart.current = {
            x: e.clientX - transformRef.current.x,
            y: e.clientY - transformRef.current.y,
        };
    }

    function handleMouseMove(e: React.MouseEvent) {
        if (!isDragging.current) return;
        const dx = e.clientX - mouseDownPos.current.x;
        const dy = e.clientY - mouseDownPos.current.y;
        if (Math.hypot(dx, dy) > 4) hasDragged.current = true;
        if (!hasDragged.current) return;
        transformRef.current = {
            ...transformRef.current,
            x: e.clientX - dragStart.current.x,
            y: e.clientY - dragStart.current.y,
        };
        forceUpdate((n) => n + 1);
    }

    function handleMouseUp() {
        isDragging.current = false;
    }

    function handleZoom(factor: number) {
        const el = mapFrameRef.current;
        if (!el) return;
        const { scale, x, y } = transformRef.current;
        const newScale = Math.min(Math.max(scale * factor, 0.9), 5);
        const mx = el.offsetWidth / 2;
        const my = el.offsetHeight / 2;
        transformRef.current = {
            scale: newScale,
            x: mx - (mx - x) * (newScale / scale),
            y: my - (my - y) * (newScale / scale),
        };
        forceUpdate((n) => n + 1);
    }

    function handleRecenter() {
        transformRef.current = { scale: 1, x: 0, y: 0 };
        forceUpdate((n) => n + 1);
    }

    function handleMapClick(e: React.MouseEvent) {
        if (hasDragged.current) return;
        const target = e.target as Element | null;
        if (!target) return;

        const territory = target.closest("path[id]");
        if (!territory) return;

        const territoryID = territory.getAttribute("id");
        if (!territoryID) return;

        clickSoundRef.current?.play();
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
        allTerritories.forEach((path) => {
            path.removeAttribute("data-highlight");
            const id = path.getAttribute("id");
            path.setAttribute(
                "data-control",
                id && controlledSet.has(id) ? "controlled" : "enemy",
            );
        });

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

    const { scale, x, y } = transformRef.current;

    return (
        <main>
            <div
                className="mapFrame"
                ref={mapFrameRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
              <div
                  className="zoomContainer"
                  style={{ transform: `translate(${x}px, ${y}px) scale(${scale})` }}
              >
                <RiskMap ref={svgRef} onClick={handleMapClick} className="mapSVG" />
              </div>
              <div className="miniMapFrame">
                <MiniMap ref={miniMapRef} className="miniMapSVG" />
              </div>
              <div className="mapControls">
                <button onMouseDown={(e) => e.stopPropagation()} onClick={() => handleZoom(1.2)}>+</button>
                <button onMouseDown={(e) => e.stopPropagation()} onClick={() => handleZoom(1 / 1.2)}>−</button>
                <button onMouseDown={(e) => e.stopPropagation()} onClick={handleRecenter}>res</button>
              </div>
            </div>
            <p className="status">{`${selectedTerritoryID.toUpperCase()} ${selectedTerritoryID ? "TERRITORY" : ""}`}</p>
        </main>
    );
}

export default App;
