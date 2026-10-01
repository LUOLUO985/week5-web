const geoJsonUrl = "https://geo.stat.fi/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature&typeName=tilastointialueet:kunta4500k&outputFormat=json&srsName=EPSG:4326";

const migrationUrl = "https://pxdata.stat.fi/PxWeb/api/v1/fi/StatFin/muutl/11a2.px";


document.addEventListener("DOMContentLoaded", initMap);


async function initMap() {
    const map = L.map("map", { minZoom: -3 });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap"
    }).addTo(map);

    try {
        await loadGeoJson(map);
    } catch (error) {
        console.error("Could not draw the municipalities:", error);
    }
}


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
        map.setView([64, 26], 5);
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


function toMigrationTable(dataset) {
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
        const position = index[code] * 2;

        table.set(code.replace("KU", ""), {
            positive: values[position],
            negative: values[position + 1]
        });
    }

    return table;
}


function getMigrationOf(feature, migration) {
    const code = String(feature.properties.kunta).padStart(3, "0");
    return migration.get(code);
}


function getColor(data) {
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
