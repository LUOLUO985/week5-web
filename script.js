const geoJsonUrl = "https://geo.stat.fi/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature&typeName=tilastointialueet:kunta4500k&outputFormat=json&srsName=EPSG:4326";

const migrationUrl = "https://pxdata.stat.fi/PxWeb/api/v1/fi/StatFin/muutl/11a2.px";


document.addEventListener("DOMContentLoaded", initMap);


async function initMap() {
    const map = L.map("map", { minZoom: -3 });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap"
    }).addTo(map);

    await loadGeoJson(map);
}


async function loadGeoJson(map) {
    const geoResponse = await fetch(geoJsonUrl);
    const geoJson = await geoResponse.json();
    const migration = await loadMigration();

    const layer = L.geoJSON(geoJson, {
        style: feature => getStyle(feature, migration),
        onEachFeature: (feature, layer) => addTooltipAndPopup(feature, layer, migration)
    }).addTo(map);

    map.fitBounds(layer.getBounds());
}


async function loadMigration() {
    const queryResponse = await fetch("migration_data_query.json");
    const query = await queryResponse.json();

    const dataResponse = await fetch(migrationUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(query)
    });
    const dataset = await dataResponse.json();

    return toMigrationTable(dataset);
}


// Builds a lookup table like "020" -> { positive: 823, negative: 750 }.
function toMigrationTable(dataset) {
    // The area variable is named after the region division (alue_23_20260101
    // today, something else later), so find it by name instead of hard-coding.
    const areaDimension = Object.keys(dataset.dimension)
        .find(name => name.startsWith("alue"));
    const index = dataset.dimension[areaDimension].category.index;

    const table = new Map();

    for (const code in index) {
        const position = index[code] * 2;

        // "KU020" -> "020", the same shape as the kunta code in the GeoJSON.
        table.set(code.replace("KU", ""), {
            positive: dataset.value[position],
            negative: dataset.value[position + 1]
        });
    }

    return table;
function getMigrationOf(feature, migration) {
    // kunta is normally "020", but pad it in case it arrives as a number.
    const code = String(feature.properties.kunta).padStart(3, "0");
    return migration.get(code);
}


function getColor(data) {
    if (!data) {
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
