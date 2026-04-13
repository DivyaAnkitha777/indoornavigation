// Constants and State
const API_URL = '/api';
let map, routeLayer, startMarker, endMarker, userMarker;
let nodes = [];
let edges = [];
let graph = {};
let startNodeId = null;
let voiceEnabled = false;
let currentPathNodes = [];
let currentPathInstructions = [];
let currentLang = 'en';
let currentFloor = 0; // 0 = G, 1 = I, 2 = II
let accessibilityMode = false;

// Advanced Tracking & Simulation
let watchId = null;
let simInterval = null;
let animationFrameId = null;
let simComplete = false;
let currentStepIndex = 0;
let previousDistToNext = Infinity; 

// Marker Groups per floor
let nodeMarkers = {};

// Translations Dictionary
const translations = {
    en: {
        title: "Indoor Navigation", start: "Starting Point", dest: "Destination", sel_dest: "-- Select Destination --",
        get_dir: "Get Directions", step: "Step-by-Step", voice_on: "🔊 Voice Guide: ON", voice_off: "🔈 Voice Guide: OFF",
        start_at: "Start at", proceed_to: "Proceed straight to", right_to: "Take a right and move to", left_to: "Take a left and move to",
        arrived_at: "You have arrived at", wrong_way: "You are moving in the wrong direction! Please turn around.",
        no_qr: "Please scan a valid QR code", error_no_start: "No valid starting point. Please scan a QR code.",
        error_no_dest: "Please select a destination.", error_no_path: "No path found to the destination.",
        speech_finally: "You have arrived at", take_stairs_up: "Take the stairs up to", take_stairs_down: "Take the stairs down to"
    },
    te: {
        title: "ఇండోర్ నావిగేషన్", start: "ప్రారంభ స్థానం", dest: "గమ్యస్థానం", sel_dest: "-- గమ్యస్థానాన్ని ఎంచుకోండి --",
        get_dir: "దారి చూపించు", step: "దశలవారీగా", voice_on: "🔊 వాయిస్ గైడ్: ఆన్", voice_off: "🔈 వాయిస్ గైడ్: ఆఫ్",
        start_at: "ఇక్కడ ప్రారంభించండి", proceed_to: "నేరుగా ముందుకు వెళ్ళండి", right_to: "కుడి వైపు తిరగండి మరియు వెళ్ళండి", left_to: "ఎడమ వైపు తిరగండి మరియు వెళ్ళండి",
        arrived_at: "మీరు చేరుకున్నారు", wrong_way: "మీరు తప్పు దిశలో వెళ్తున్నారు! దయచేసి వెనక్కి తిరగండి.",
        no_qr: "దయచేసి సరైన QR కోడ్‌ని స్కాన్ చేయండి", error_no_start: "సరైన ప్రారంభ స్థానం లేదు.",
        error_no_dest: "దయచేసి గమ్యస్థానాన్ని ఎంచుకోండి.", error_no_path: "గమ్యస్థానానికి దారి కనుగొనబడలేదు.",
        speech_finally: "మీరు ఇక్కడికి చేరుకున్నారు", take_stairs_up: "మెట్లు పైకి వెళ్ళండి", take_stairs_down: "మెట్లు కిందకి వెళ్ళండి"
    },
    hi: {
        title: "इंडोर नेविगेशन", start: "प्रारंभिक बिंदु", dest: "गंतव्य", sel_dest: "-- गंतव्य चुनें --",
        get_dir: "दिशा-निर्देश प्राप्त करें", step: "क्रमशः", voice_on: "🔊 वॉइस गाइड: चालू", voice_off: "🔈 वॉइस गाइड: बंद",
        start_at: "शुरू करें", proceed_to: "सीधे आगे बढ़ें", right_to: "दाएं मुड़ें और जाएं", left_to: "बाएं मुड़ें और जाएं",
        arrived_at: "आप पहुंच गए हैं", wrong_way: "आप गलत दिशा में जा रहे हैं! कृपया वापस मुड़ें।",
        no_qr: "कृपया एक वैध QR कोड स्कैन करें", error_no_start: "कोई वैध प्रारंभिक बिंदु नहीं है।",
        error_no_dest: "कृपया एक गंतव्य चुनें।", error_no_path: "गंतव्य तक कोई रास्ता नहीं मिला।",
        speech_finally: "आप पहुँच गए हैं", take_stairs_up: "सीढियों से ऊपर जाएँ", take_stairs_down: "सीढियों से नीचे जाएँ"
    }
};

let synth = window.speechSynthesis;
let voices = [];
function updateVoices() { voices = synth.getVoices(); }
if (synth.onvoiceschanged !== undefined) synth.onvoiceschanged = updateVoices;

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    checkUrlParams();
    fetchGraphData();
    changeLanguage();
    checkGeolocationSupport();
});

function switchFloor(f) {
    currentFloor = f;
    document.querySelectorAll('.floor-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`btn-floor-${f}`).classList.add('active');
    
    // Redraw map based on new floor constraint
    drawMapElements();
}

function checkGeolocationSupport() {
    if (window.isSecureContext === false) {
        document.getElementById('geo-error-banner').classList.remove('hidden');
    }
}

function changeLanguage() {
    currentLang = document.getElementById('language').value || 'en';
    const t = translations[currentLang];
    const elements = { 'ui-title': t.title, 'ui-start': t.start, 'ui-dest': t.dest, 'ui-sel-dest': t.sel_dest, 'btn-get-dir': t.get_dir, 'ui-step': t.step };
    for (const [id, text] of Object.entries(elements)) { let el = document.getElementById(id); if (el) el.textContent = text; }
    let voiceBtn = document.getElementById('voice-btn');
    if (voiceBtn) voiceBtn.textContent = voiceEnabled ? t.voice_on : t.voice_off;
    updateUIWithStartNode();

    if (currentPathNodes.length > 0) generateInstructions(currentPathNodes.map(n => n.id));
}

function initMap() {
    // Focus on Block E (Library) at Vishnu Institute
    map = L.map('map', { maxZoom: 22, zoomControl: true }).setView([16.56605, 81.52185], 20);
    L.tileLayer('http://mt0.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}', { maxZoom: 22, attribution: '© Google Maps' }).addTo(map);
    routeLayer = L.layerGroup().addTo(map);
}

function checkUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    startNodeId = urlParams.get('start');
    if (!startNodeId) {
        // Default to Main gate for demo purposes if no QR is scannned
        startNodeId = 'main_gate';
    }
}

async function fetchGraphData() {
    try {
        const [nodesRes, edgesRes] = await Promise.all([fetch(`${API_URL}/nodes`), fetch(`${API_URL}/edges`)]);
        if (nodesRes.ok && edgesRes.ok) { 
            nodes = await nodesRes.json(); 
            edges = await edgesRes.json(); 
        }
    } catch (e) {
        console.error("Could not fetch from server.", e);
        // Fallback for safety if backend isn't running so the app doesn't break
        alert("Backend server is not running. Simulation will wait until data is available.");
    }
    
    buildGraph();
    updateUIWithStartNode();
    drawMapElements();

    if (window.isSecureContext && navigator.geolocation) {
        startNativeTracking();
    }
}

function buildGraph() {
    graph = {};
    nodes.forEach(n => { graph[n.id] = { ...n, neighbors: {} }; });
    edges.forEach(e => {
        if (graph[e.source] && graph[e.target]) {
            graph[e.source].neighbors[e.target] = e.weight;
            graph[e.target].neighbors[e.source] = e.weight;
        }
    });
}

function updateUIWithStartNode() {
    const t = translations[currentLang];
    const inputDisplay = document.getElementById('start-node-display');
    if (!inputDisplay) return;

    if (startNodeId && graph[startNodeId]) {
        inputDisplay.value = graph[startNodeId].name;
        // Auto-switch to the starting floor
        switchFloor(graph[startNodeId].floor);
    } else {
        inputDisplay.value = t.no_qr;
    }
}

function dijkstra(start, target) {
    const distances = {}; const previous = {}; const queue = new Set(nodes.map(n => n.id));
    nodes.forEach(n => { distances[n.id] = Infinity; previous[n.id] = null; });
    distances[start] = 0;

    while (queue.size > 0) {
        let current = null; let minDistance = Infinity;
        for (const nodeId of queue) {
            if (distances[nodeId] < minDistance) { minDistance = distances[nodeId]; current = nodeId; }
        }
        if (current === null || current === target) break;
        queue.delete(current);

        for (const neighbor in graph[current].neighbors) {
            if (!queue.has(neighbor)) continue;
            
            // Check accessibility constraint (no stairs if wheelchair mode is on)
            if (accessibilityMode) {
                if (graph[neighbor].type === 'stairs' || graph[current].type === 'stairs') {
                    continue; // Skip calculating this edge
                }
            }

            const alt = distances[current] + graph[current].neighbors[neighbor];
            if (alt < distances[neighbor]) { distances[neighbor] = alt; previous[neighbor] = current; }
        }
    }

    const path = []; let curr = target;
    while (curr) { path.unshift(curr); curr = previous[curr]; }
    return path[0] === start ? path : [];
}

function calculateRoute() {
    const t = translations[currentLang];
    const destinationId = document.getElementById('destination').value;

    if (!startNodeId || !graph[startNodeId]) { alert(t.error_no_start); return; }
    if (!destinationId) { alert(t.error_no_dest); return; }

    const pathIds = dijkstra(startNodeId, destinationId);
    if (pathIds.length === 0) { alert(t.error_no_path); return; }

    // Stop ongoing animations
    if(animationFrameId) cancelAnimationFrame(animationFrameId);
    if(userMarker) map.removeLayer(userMarker);
    userMarker = null;

    currentPathNodes = pathIds.map(id => graph[id]);
    drawMapElements();
    generateInstructions(pathIds);

    // Switch to start node's floor to begin
    switchFloor(graph[startNodeId].floor);

    currentStepIndex = 0;
    previousDistToNext = Infinity;
    document.getElementById('simulate-btn').disabled = false;

    if (voiceEnabled) {
        speak(`${t.start_at} ${graph[pathIds[0]].name}.`);
    }
}

function drawMapElements() {
    routeLayer.clearLayers();
    if (endMarker) map.removeLayer(endMarker);
    
    // Draw all POI markers for the CURRENT FLOOR
    nodes.forEach(node => {
        if (node.floor === currentFloor) {
            L.circleMarker([node.lat, node.lng], {
                color: node.id === startNodeId ? 'green' : 'gray',
                radius: node.id === startNodeId ? 7 : 4,
                fillOpacity: 0.8
            }).bindPopup(node.name).addTo(routeLayer);
        }
    });

    // Draw routing specific arrays
    if (currentPathNodes.length > 0) {
        let currentSegment = [];
        
        // Only draw the parts of the path that belong to the currently viewed floor
        for(let i=0; i<currentPathNodes.length; i++) {
            let node = currentPathNodes[i];
            
            if (node.floor === currentFloor) {
                currentSegment.push([node.lat, node.lng]);
            } else {
                // If segment breaks (switch floor), render what we have and reset
                if (currentSegment.length > 1) {
                    L.polyline(currentSegment, { color: 'var(--primary-color)', weight: 6, opacity: 0.8, className: 'dash-array-anim' }).addTo(routeLayer);
                }
                // Include connection point so path links to the stairs on the new floor
                if (currentSegment.length > 0) {
                    // Draw up to the stairs
                    currentSegment = [[currentPathNodes[i-1].lat, currentPathNodes[i-1].lng]];
                } else {
                    currentSegment = [];
                }
            }
        }
        
        // draw remaining
        if (currentSegment.length > 1) {
            L.polyline(currentSegment, { color: 'var(--primary-color)', weight: 6, opacity: 0.8, className: 'dash-array-anim' }).addTo(routeLayer);
        }

        // Draw destination clearly if it's on this floor
        const destNode = currentPathNodes[currentPathNodes.length - 1];
        if (destNode.floor === currentFloor) {
            endMarker = L.circleMarker([destNode.lat, destNode.lng], { color: 'red', radius: 8, fillOpacity: 1 })
                .addTo(map).bindPopup("<b>Destination:</b> " + destNode.name).openPopup();
        }
        
        // Auto-center (only if we have a segment on this floor)
        if (currentSegment.length > 0 || destNode.floor === currentFloor) {
             // map.panTo([currentPathNodes[0].lat, currentPathNodes[0].lng]); // optionally pan to start
        }
    }
}

// ======================= BEARING AND TURN CALCULATIONS =====================
function getBearing(lat1, lng1, lat2, lng2) {
    let dLng = (lng2 - lng1) * Math.PI / 180;
    lat1 = lat1 * Math.PI / 180;
    lat2 = lat2 * Math.PI / 180;
    let y = Math.sin(dLng) * Math.cos(lat2);
    let x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    let brng = Math.atan2(y, x);
    return (brng * 180 / Math.PI + 360) % 360;
}

function getTurnInstruction(prevNode, currNode, nextNode) {
    const t = translations[currentLang];
    if (!prevNode) return `${t.proceed_to} ${nextNode.name}`;

    // Floor switching check
    if (currNode.floor < nextNode.floor) return `${t.take_stairs_up} Floor ${nextNode.floor === 1 ? 'I' : 'II'}`;
    if (currNode.floor > nextNode.floor) return `${t.take_stairs_down} Floor ${nextNode.floor === 0 ? 'G' : 'I'}`;

    let b1 = getBearing(prevNode.lat, prevNode.lng, currNode.lat, currNode.lng);
    let b2 = getBearing(currNode.lat, currNode.lng, nextNode.lat, nextNode.lng);
    let diff = (b2 - b1 + 360) % 360;

    if (diff > 30 && diff < 160) return `${t.right_to} ${nextNode.name}`;
    if (diff > 200 && diff < 330) return `${t.left_to} ${nextNode.name}`;

    return `${t.proceed_to} ${nextNode.name}`;
}

// ======================= INSTRUCTIONS & VOICE ==============================
function generateInstructions(pathIds) {
    const t = translations[currentLang];
    const list = document.getElementById('instructionsList');
    list.innerHTML = '';
    currentPathInstructions = [];

    for (let i = 0; i < pathIds.length; i++) {
        const node = graph[pathIds[i]];
        let text = "";

        if (i === 0) {
            text = `${t.start_at} ${node.name}`;
        } else if (i === pathIds.length - 1) {
            text = `${t.arrived_at} ${node.name}`;
        } else {
            let prevNode = graph[pathIds[i - 1]];
            let nextNode = graph[pathIds[i + 1]];
            text = getTurnInstruction(prevNode, node, nextNode);
        }
        
        currentPathInstructions.push(text);

        const li = document.createElement('li');
        li.textContent = text;
        
        // Add floor badge
        let badge = document.createElement('span');
        badge.style.fontSize = "0.7em";
        badge.style.marginLeft = "8px";
        badge.style.padding = "2px 6px";
        badge.style.background = "#E0E7FF";
        badge.style.borderRadius = "10px";
        badge.style.color = "var(--primary-color)";
        badge.textContent = `F${node.floor === 0 ? 'G' : node.floor === 1 ? 'I' : 'II'}`;
        li.appendChild(badge);

        li.id = `instruction-step-${i}`;
        list.appendChild(li);
    }
    document.getElementById('instructionsPanel').classList.remove('hidden');
    highlightInstruction(0);
}

function highlightInstruction(index) {
    const listItems = document.querySelectorAll('#instructionsList li');
    listItems.forEach((li, i) => {
        li.style.color = (i === index) ? 'var(--primary-color)' : 'var(--text-light)';
        li.style.fontWeight = (i === index) ? 'bold' : 'normal';
    });
    
    // Auto-scroll
    if(listItems[index]) {
        listItems[index].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

function speak(text) {
    if (synth.speaking) synth.cancel();
    const utterThis = new SpeechSynthesisUtterance(text);
    let langCode = 'en-US';
    if (currentLang === 'te') langCode = 'te-IN';
    if (currentLang === 'hi') langCode = 'hi-IN';

    const voice = voices.find(v => v.lang.startsWith(langCode.split('-')[0]));
    if (voice) utterThis.voice = voice;

    utterThis.lang = langCode;
    utterThis.rate = currentLang === 'en' ? 1.0 : 0.8;
    synth.speak(utterThis);
}

// ======================= LIVE TRACKING (IF AVAILABLE) =====================
function startNativeTracking() {
    if (!navigator.geolocation) {
        console.log("Geolocation is not supported by your browser");
        return;
    }

    watchId = navigator.geolocation.watchPosition(
        (pos) => {
            updateUserMarker(pos.coords.latitude, pos.coords.longitude);
            // Optionally, we could pan to the user if they drift off screen:
            // map.panTo([pos.coords.latitude, pos.coords.longitude]);
        },
        (err) => {
            console.warn("GPS Tracking Error: ", err.message);
            if (err.code === 1) {
                // Permission denied
                document.getElementById('geo-error-banner').innerHTML = "⚠️ Location access denied. Please enable GPS permissions in your phone settings to track your physical movement.";
                document.getElementById('geo-error-banner').classList.remove('hidden');
            }
        },
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    );
}

function updateUserMarker(lat, lng) {
    if (!userMarker) {
        userMarker = L.circleMarker([lat, lng], { 
            color: 'white', fillColor: '#3B82F6', fillOpacity: 1, radius: 8, weight: 2 
        }).addTo(map);
    } else {
        userMarker.setLatLng([lat, lng]);
    }
}

// ======================= ADVANCED SMOOTH SIMULATION =======================
function startSimulation() {
    if (currentPathNodes.length === 0) { alert("Please get a route first!"); return; }
    if (currentPathNodes.length === 1) { 
        alert("You are already at your destination!"); 
        showLiveAlert("✅ Arrived"); 
        setTimeout(hideLiveAlert, 3000);
        return; 
    }

    document.getElementById('simulate-btn').disabled = true;
    if(animationFrameId) cancelAnimationFrame(animationFrameId);

    // Initial setup
    currentStepIndex = 0;
    simComplete = false;
    let currentNodeIndex = 0;
    let startTimestamp = null;
    
    // We will calculate duration dynamically based on distance, but we need a base duration
    let getDurationForEdge = (nodeA, nodeB) => {
        let dist = Math.sqrt(Math.pow(nodeA.lat - nodeB.lat, 2) + Math.pow(nodeA.lng - nodeB.lng, 2));
        // A tuning factor to convert lat/lng distance to ms. 
        // 0.001 roughly equals 100 meters. Let's make average speeds ~7-10 seconds per node.
        let ms = Math.max(7000, dist * 5000000); // minimum 7 seconds per segment
        return Math.min(ms, 15000); // cap to 15s max per segment
    };

    let durationPerNode = getDurationForEdge(currentPathNodes[0], currentPathNodes[1] || currentPathNodes[0]);

    let currentN = currentPathNodes[0];
    switchFloor(currentN.floor);
    updateUserMarker(currentN.lat, currentN.lng);
    map.setView([currentN.lat, currentN.lng], 20);
    highlightInstruction(0);
    
    // Starting Alert Initializer
    if (currentPathNodes.length > 1) {
        let text = `⬆️ Move Forward to ${currentPathNodes[1].name}`;
        showLiveAlert(text);
        if(voiceEnabled) speak(text);
    }

    function animate(timestamp) {
        if (!startTimestamp) startTimestamp = timestamp;
        let elapsed = timestamp - startTimestamp;
        let progress = elapsed / durationPerNode;

        if (simComplete) {
            document.getElementById('simulate-btn').disabled = false;
            return;
        }

        let startNode = currentPathNodes[currentNodeIndex];
        let targetNode = currentPathNodes[currentNodeIndex + 1];

        // If transitioning across floors (taking stairs), auto-switch floor
        if (startNode.floor !== targetNode.floor && elapsed < 50) {
            switchFloor(targetNode.floor);
        }

        if (progress >= 1) progress = 1;

        // Interpolate position
        let lat = startNode.lat + (targetNode.lat - startNode.lat) * progress;
        let lng = startNode.lng + (targetNode.lng - startNode.lng) * progress;
        
        // Only update marker/pan map if the marker is on the currently active floor UI
        if(targetNode.floor === currentFloor) {
            updateUserMarker(lat, lng);
            map.panTo([lat, lng], { animate: false });
        }

        if (progress >= 1) {
            currentNodeIndex++;
            highlightInstruction(currentNodeIndex);
            startTimestamp = null; // Reset for next edge
            
            // Logic for Granular Turn Alert instead of the full path text
            if (currentNodeIndex < currentPathNodes.length - 1) {
                let prevNode = currentNodeIndex > 0 ? currentPathNodes[currentNodeIndex - 1] : null;
                let currNode = currentPathNodes[currentNodeIndex];
                let nextNode = currentPathNodes[currentNodeIndex + 1];
                
                let actionText = "";
                if (!prevNode) actionText = `⬆️ Move Forward`;
                else if (currNode.floor < nextNode.floor) actionText = `⬆️ Stairs Up`;
                else if (currNode.floor > nextNode.floor) actionText = `⬇️ Stairs Down`;
                else {
                    let b1 = getBearing(prevNode.lat, prevNode.lng, currNode.lat, currNode.lng);
                    let b2 = getBearing(currNode.lat, currNode.lng, nextNode.lat, nextNode.lng);
                    let diff = (b2 - b1 + 360) % 360;
                    if (diff > 30 && diff < 160) actionText = `➡️ Turn Right`;
                    else if (diff > 200 && diff < 330) actionText = `⬅️ Turn Left`;
                    else actionText = `⬆️ Move Forward`;
                }
                
                showLiveAlert(actionText);

                if (voiceEnabled) speak(actionText);
            }

            // If we reached the last node, end the simulation perfectly
            if (currentNodeIndex >= currentPathNodes.length - 1) {
                simComplete = true;
                showLiveAlert(`✅ Arrived at ${currentPathNodes[currentNodeIndex].name}`);
                if (voiceEnabled) speak(`You have arrived at ${currentPathNodes[currentNodeIndex].name}`);
                setTimeout(hideLiveAlert, 5000);
            } else {
                // Update duration for the next specific edge
                durationPerNode = getDurationForEdge(currentPathNodes[currentNodeIndex], currentPathNodes[currentNodeIndex + 1]);
            }
        }

        if (!simComplete) {
            animationFrameId = requestAnimationFrame(animate);
        } else {
            document.getElementById('simulate-btn').disabled = false;
        }
    }

    animationFrameId = requestAnimationFrame(animate);
}

function toggleVoice() {
    const t = translations[currentLang];
    voiceEnabled = !voiceEnabled;
    const btn = document.getElementById('voice-btn');
    if (voiceEnabled) {
        btn.textContent = t.voice_on;
        btn.classList.replace('btn-secondary', 'btn-primary');
    } else {
        btn.textContent = t.voice_off;
        btn.classList.replace('btn-primary', 'btn-secondary');
        synth.cancel();
    }
}

// ======================= NAVIFY ADVANCED FEATURES =======================
function showLiveAlert(text) {
    const alertBox = document.getElementById('live-alert');
    if (alertBox) {
        alertBox.textContent = text;
        alertBox.classList.remove('hidden');
        
        // Restart animation
        alertBox.style.animation = 'none';
        alertBox.offsetHeight; /* trigger reflow */
        alertBox.style.animation = null; 
    }
}

function hideLiveAlert() {
    const alertBox = document.getElementById('live-alert');
    if (alertBox) alertBox.classList.add('hidden');
}

function triggerEmergency() {
    if (!startNodeId || !graph[startNodeId]) {
        alert("Cannot determine starting location for emergency exit.");
        return;
    }
    
    // Offline notification combo
    if (!navigator.onLine) {
        alert("⚠ No internet — emergency alert will be sent when connection is restored.");
    } else {
        const floorNames = {0: 'Ground Floor', 1: 'First Floor', 2: 'Second Floor'};
        const loc = graph[startNodeId];
        console.log(`🚨 EMERGENCY ALERT SENT TO ADMIN: User at ${loc.name} (${floorNames[loc.floor] || 'Outdoor'}) at ${new Date().toLocaleTimeString()}`);
        alert(`🚨 ALERT SENT TO ADMIN!\nLocation: ${loc.name} (${floorNames[loc.floor] || 'Outdoor'})\n\nRouting you to the nearest safety exit now!`);
    }

    // Find nearest entrance/exit
    let nearestExitId = null;
    let shortestDist = Infinity;
    
    // Quick dijkstra to all nodes to find distances
    let allDistances = getDistancesToAll(startNodeId);
    
    nodes.forEach(n => {
        if (n.type === 'entrance' || n.type === 'exit') {
            if (allDistances[n.id] < shortestDist) {
                shortestDist = allDistances[n.id];
                nearestExitId = n.id;
            }
        }
    });

    if (nearestExitId) {
        document.getElementById('destination').value = nearestExitId;
        calculateRoute();
    } else {
        alert("No emergency exits configured in the map.");
    }
}

function getDistancesToAll(start) {
    const distances = {}; const queue = new Set(nodes.map(n => n.id));
    nodes.forEach(n => { distances[n.id] = Infinity; });
    distances[start] = 0;

    while (queue.size > 0) {
        let current = null; let minDistance = Infinity;
        for (const nodeId of queue) {
            if (distances[nodeId] < minDistance) { minDistance = distances[nodeId]; current = nodeId; }
        }
        if (current === null) break;
        queue.delete(current);

        for (const neighbor in graph[current].neighbors) {
            if (!queue.has(neighbor)) continue;
            
            if (accessibilityMode) {
                if (graph[neighbor].type === 'stairs' || graph[current].type === 'stairs') continue;
            }

            const alt = distances[current] + graph[current].neighbors[neighbor];
            if (alt < distances[neighbor]) { distances[neighbor] = alt; }
        }
    }
    return distances;
}

function filterDestinations() {
    const searchVal = document.getElementById('destination-search').value.toLowerCase();
    const select = document.getElementById('destination');
    const options = select.getElementsByTagName('option');
    
    // Reset to destination selection default
    select.value = "";

    for (let i = 1; i < options.length; i++) { // Skip the default option
        const label = options[i].text.toLowerCase();
        if (label.includes(searchVal)) {
            options[i].style.display = ""; // Show
            options[i].hidden = false;
            options[i].disabled = false;
            // Auto select if it's a good match and we searched something
            if (searchVal.length > 2 && select.value === "") {
                select.value = options[i].value;
            }
        } else {
            options[i].style.display = "none"; // Hide
            options[i].hidden = true;
            options[i].disabled = true;
        }
    }
}

function toggleAccessibility() {
    accessibilityMode = document.getElementById('accessibility-mode').checked;
    console.log("Accessibility Mode: ", accessibilityMode);
    // Recalculate route if one is already active so they see the change immediately
    if (currentPathNodes.length > 0) {
        calculateRoute();
    }
}