const geoJsonUrl = "https://geo.stat.fi/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature&typeName=tilastointialueet:kunta4500k&outputFormat=json&srsName=EPSG:4326";

const migrationUrl = "https://pxdata.stat.fi/PxWeb/api/v1/fi/StatFin/muutl/11a2.px";


document.addEventListener("DOMContentLoaded", initMap);


async function initMap() {
    const map = L.map("map", { minZoom: -3 });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap"
    }).addTo(map);

    // Both data sources are outside our control, so a bad answer from one of
    // them must never stop the page. We report it and keep the map visible.
    try {
        await loadGeoJson(map);
    } catch (error) {
        console.error("Could not draw the municipalities:", error);
    }
}


// fetch + parse that returns null instead of throwing when the answer is
// empty, cut short or not JSON at all.
async function loadJson(url, options) {
    const response = await fetch(url, options);
    const text = await response.text();

    try {
        return JSON.parse(text);
    } catch (error) {
        console.error("Not valid JSON from " + url + ":", text.slice(0, 200));
        return null;
    }
}


async function loadGeoJson(map) {
    const geoJson = await loadJson(geoJsonUrl);
    const migration = await loadMigration();

    if (!geoJson || !geoJson.features) {
        console.error("No GeoJSON features to draw.");
        map.setView([64, 26], 5);   // fallback view, so the base map is still visible
        return;
    }

    const layer = L.geoJSON(geoJson, {
        style: feature => getStyle(feature, migration),
        onEachFeature: (feature, layer) => addTooltipAndPopup(feature, layer, migration)
    }).addTo(map);

    map.fitBounds(layer.getBounds());
}


async function loadMigration() {
    const query = await loadJson("migration_data_query.json");
    if (!query) {
        return new Map();
    }

    const dataset = await loadJson(migrationUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(query)
    });
    if (!dataset) {
        return new Map();
    }

    return toMigrationTable(dataset);
}


// Builds a lookup table like "020" -> { positive: 823, negative: 750 }.
function toMigrationTable(dataset) {
    // The area variable is named after the region division (alue_23_20260101
    // today, something else later), so find it by name instead of hard-coding.
    const dimension = dataset.dimension || {};
    const areaDimension = Object.keys(dimension).find(name => name.startsWith("alue"));

    if (!areaDimension) {
        console.error("No area dimension in the migration data.");
        return new Map();
    }

    const index = dimension[areaDimension].category.index;
    const values = dataset.value || [];
    const table = new Map();

    for (const code in index) {
        // Every municipality has two slots: first incoming (positive),
        // then outgoing (negative).
        const position = index[code] * 2;

        // "KU020" -> "020", the same shape as the kunta code in the GeoJSON.
        table.set(code.replace("KU", ""), {
            positive: values[position],
            negative: values[position + 1]
        });
    }

    return table;
}


// Migration numbers of one municipality, or undefined when there are none.
function getMigrationOf(feature, migration) {
    // kunta is normally "020", but pad it in case it arrives as a number.
    const code = String(feature.properties.kunta).padStart(3, "0");
    return migration.get(code);
}


function getColor(data) {
    // Some areas have no migration row. Paint them grey instead of crashing.
    if (!data || data.positive === undefined || !data.negative) {
        return "#cccccc";
    }

    const hue = Math.min(Math.pow(data.positive / data.negative, 3) * 60, 120);
    return `hsl(${hue}, 75%, 50%)`;
}


function getStyle(feature, migration) {
    const color = getColor(getMigrationOf(feature, migration));

    return {
        weight: 2,
        color: color,
        fillColor: color,
        fillOpacity: 0.7
    };
}


function addTooltipAndPopup(feature, layer, migration) {
    const data = getMigrationOf(feature, migration);

    layer.bindTooltip(feature.properties.name);

    if (!data) {
        layer.bindPopup(feature.properties.name);
        return;
    }

    layer.bindPopup(`
        <b>${feature.properties.name}</b><br>
        Positive migration: ${data.positive}<br>
        Negative migration: ${data.negative}
    `);
}
