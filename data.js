let yearlyRates = {};
let displayIndices = [];
let startYear, endYear;
let sortAscending = false;

const formatter = new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});

function initData() {
    if (typeof rawData === 'undefined' || rawData === null) {
        throw new Error("Variável 'rawData' não encontrada.");
    }

    const allKeys = Object.keys(rawData);
    displayIndices = allKeys.filter(key => key !== 'USD');
    
    yearlyRates = {};
    let minYear = Infinity;
    let maxYear = -Infinity;

    allKeys.forEach(indexKey => {
        yearlyRates[indexKey] = {};
        const indexInfo = rawData[indexKey].data;
        const years = Object.keys(indexInfo).map(Number).sort((a, b) => a - b);
        const isUSDAsset = rawData[indexKey].currency === "USD";
        
        if (years.length > 0) {
            minYear = Math.min(minYear, ...years);
            maxYear = Math.max(maxYear, ...years);
        }

        const valuesInBRL = {};
        years.forEach(yr => {
            const pt = indexInfo[yr];
            if (pt.value !== "" && pt.value !== undefined) {
                let val = parseFloat(pt.value);
                if (isUSDAsset) {
                    const fx = parseFloat(rawData["USD"].data[yr]?.value || 1);
                    val *= fx;
                }
                valuesInBRL[yr] = val;
            }
        });

        for (let i = 0; i < years.length; i++) {
            const year = years[i];
            const point = indexInfo[year];
            
            if (point.rate !== "" && point.rate !== undefined) {
                let rate = parseFloat(point.rate);
                if (isUSDAsset && i > 0) {
                    const fxPrev = parseFloat(rawData["USD"].data[years[i-1]]?.value);
                    const fxCurr = parseFloat(rawData["USD"].data[year]?.value);
                    if (fxPrev && fxCurr) rate = (1 + rate) * (fxCurr / fxPrev) - 1;
                }
                yearlyRates[indexKey][year] = rate;
            } else if (valuesInBRL[year] !== undefined && i > 0) {
                const prevYear = years[i - 1];
                if (valuesInBRL[prevYear] !== undefined) {
                    yearlyRates[indexKey][year] = (valuesInBRL[year] / valuesInBRL[prevYear]) - 1;
                }
            }
        }
    });

    startYear = minYear;
    endYear = maxYear;
}

function toggleSortOrder() {
    sortAscending = !sortAscending;
}

function getColorForValue(value, isIpca, globalMin, globalMax) {
    if (value === null || isIpca) return 'transparent';
    
    const minColor = [255, 107, 129]; // Pastel Coral
    const midColor = [255, 235, 153]; // Pastel Yellow
    const maxColor = [123, 237, 159]; // Pastel Mint Green
    
    const mid = (globalMin + globalMax) / 2;
    let r, g, b;

    if (value <= mid) {
        const percent = (globalMin === mid) ? 0.5 : (value - globalMin) / (mid - globalMin);
        r = Math.round(minColor[0] + percent * (midColor[0] - minColor[0]));
        g = Math.round(minColor[1] + percent * (midColor[1] - minColor[1]));
        b = Math.round(minColor[2] + percent * (midColor[2] - minColor[2]));
    } else {
        const percent = (globalMax === mid) ? 0.5 : (value - mid) / (globalMax - mid);
        r = Math.round(midColor[0] + percent * (maxColor[0] - midColor[0]));
        g = Math.round(midColor[1] + percent * (maxColor[1] - midColor[1]));
        b = Math.round(midColor[2] + percent * (maxColor[2] - midColor[2]));
    }
    return `rgba(${r}, ${g}, ${b}, 0.25)`;
}

function getTableHTML(params) {
    const { windowSize, isRealReturn, isNetReturn, taxRate, selectedIndices } = params;
    const tableRows = [];
    let globalMin = Infinity;
    let globalMax = -Infinity;

    for (let year = startYear; year <= endYear; year++) {
        const rowReturns = { year };
        let hasAtLeastOneResult = false;

        let ipcaCompounded = 1;
        let isIpcaValid = true;
        for (let j = year - (windowSize - 1); j <= year; j++) {
            if (yearlyRates["IPCA"][j] !== undefined) {
                ipcaCompounded *= (1 + yearlyRates["IPCA"][j]);
            } else {
                isIpcaValid = false;
                break;
            }
        }

        selectedIndices.forEach(indexKey => {
            let compoundedReturn = 1;
            let isValidWindow = true;
            for (let j = year - (windowSize - 1); j <= year; j++) {
                if (yearlyRates[indexKey][j] !== undefined) {
                    compoundedReturn *= (1 + yearlyRates[indexKey][j]);
                } else {
                    isValidWindow = false;
                    break;
                }
            }

            if (isValidWindow) {
                let finalCompound = compoundedReturn;
                if (indexKey !== "IPCA") {
                    if (isNetReturn && finalCompound > 1) {
                        finalCompound = ((finalCompound - 1) * (1 - taxRate)) + 1;
                    }
                    if (isRealReturn) {
                        if (isIpcaValid) finalCompound = finalCompound / ipcaCompounded;
                        else isValidWindow = false;
                    }
                }

                if (isValidWindow) {
                    const annualizedReturn = Math.pow(finalCompound, 1 / windowSize) - 1;
                    rowReturns[indexKey] = annualizedReturn;
                    hasAtLeastOneResult = true;
                    if (indexKey !== "IPCA") {
                        if (annualizedReturn < globalMin) globalMin = annualizedReturn;
                        if (annualizedReturn > globalMax) globalMax = annualizedReturn;
                    }
                } else rowReturns[indexKey] = null;
            } else rowReturns[indexKey] = null;
        });

        if (hasAtLeastOneResult) {
            if (sortAscending) tableRows.push(rowReturns);
            else tableRows.unshift(rowReturns);
        }
    }

    if (tableRows.length === 0) {
        return `<div class="no-data-msg">Nenhum dado histórico para uma janela de ${windowSize} anos.</div>`;
    }

    const thead = `<thead><tr><th onclick="toggleSort()" style="cursor: pointer;">Ano ${sortAscending ? '↑' : '↓'}</th>${selectedIndices.map(idx => {
        const type = rawData[idx].type;
        // const icon = type === 'etf' ? '📦' : '📈';
        const usdClass = rawData[idx].currency === 'USD' ? 'usd-column-highlight' : '';
        return `<th class="${usdClass}"><span title="${type}" style="cursor: help; margin-right: 2px; font-size: 0.5rem; vertical-align: middle;"></span>${idx}</th>`;
    }).join('')}</tr></thead>`;

    const tbody = `<tbody>${tableRows.map(row => `<tr><td>${row.year}</td>${selectedIndices.map(idx => {
        const usdClass = rawData[idx].currency === 'USD' ? 'usd-column-highlight' : '';
        const bgColor = getColorForValue(row[idx], idx === "IPCA", globalMin, globalMax);
        return `<td class="${usdClass}" style="background-color: ${bgColor};">${row[idx] !== null ? formatter.format(row[idx]) : '-'}</td>`;
    }).join('')}</tr>`).join('')}</tbody>`;

    return `<table>${thead}${tbody}</table>`;
}

const rawData = {
    "IPCA": {
        "name": "IPCA",
        "type": "index",
        "data": {
            "2000": {"year": 2000, "rate": 0.0597, "value": ""},
            "2001": {"year": 2001, "rate": 0.0767, "value": ""},
            "2002": {"year": 2002, "rate": 0.1253, "value": ""},
            "2003": {"year": 2003, "rate": 0.093, "value": ""},
            "2004": {"year": 2004, "rate": 0.076, "value": ""},
            "2005": {"year": 2005, "rate": 0.0569, "value": ""},
            "2006": {"year": 2006, "rate": 0.0314, "value": ""},
            "2007": {"year": 2007, "rate": 0.0446, "value": ""},
            "2008": {"year": 2008, "rate": 0.059, "value": ""},
            "2009": {"year": 2009, "rate": 0.0431, "value": ""},
            "2010": {"year": 2010, "rate": 0.0591, "value": ""},
            "2011": {"year": 2011, "rate": 0.065, "value": ""},
            "2012": {"year": 2012, "rate": 0.0584, "value": ""},
            "2013": {"year": 2013, "rate": 0.0591, "value": ""},
            "2014": {"year": 2014, "rate": 0.0641, "value": ""},
            "2015": {"year": 2015, "rate": 0.1067, "value": ""},
            "2016": {"year": 2016, "rate": 0.0629, "value": ""},
            "2017": {"year": 2017, "rate": 0.0295, "value": ""},
            "2018": {"year": 2018, "rate": 0.0375, "value": ""},
            "2019": {"year": 2019, "rate": 0.0431, "value": ""},
            "2020": {"year": 2020, "rate": 0.0452, "value": ""},
            "2021": {"year": 2021, "rate": 0.1006, "value": ""},
            "2022": {"year": 2022, "rate": 0.0578, "value": ""},
            "2023": {"year": 2023, "rate": 0.0462, "value": ""},
            "2024": {"year": 2024, "rate": 0.0483, "value": ""},
            "2025": {"year": 2025, "rate": 0.0426, "value": ""}
        }
    },
    "CDI": {
        "name": "CDI",
        "type": "index",
        "data": {
            "2000": {"year": 2000, "rate": 0.1733, "value": ""},
            "2001": {"year": 2001, "rate": 0.1727, "value": ""},
            "2002": {"year": 2002, "rate": 0.1909, "value": ""},
            "2003": {"year": 2003, "rate": 0.2328, "value": ""},
            "2004": {"year": 2004, "rate": 0.1617, "value": ""},
            "2005": {"year": 2005, "rate": 0.19, "value": ""},
            "2006": {"year": 2006, "rate": 0.1505, "value": ""},
            "2007": {"year": 2007, "rate": 0.1182, "value": ""},
            "2008": {"year": 2008, "rate": 0.1237, "value": ""},
            "2009": {"year": 2009, "rate": 0.099, "value": ""},
            "2010": {"year": 2010, "rate": 0.0974, "value": ""},
            "2011": {"year": 2011, "rate": 0.1159, "value": ""},
            "2012": {"year": 2012, "rate": 0.0841, "value": ""},
            "2013": {"year": 2013, "rate": 0.0805, "value": ""},
            "2014": {"year": 2014, "rate": 0.1081, "value": ""},
            "2015": {"year": 2015, "rate": 0.1323, "value": ""},
            "2016": {"year": 2016, "rate": 0.14, "value": ""},
            "2017": {"year": 2017, "rate": 0.0995, "value": ""},
            "2018": {"year": 2018, "rate": 0.0642, "value": ""},
            "2019": {"year": 2019, "rate": 0.0597, "value": ""},
            "2020": {"year": 2020, "rate": 0.0277, "value": ""},
            "2021": {"year": 2021, "rate": 0.044, "value": ""},
            "2022": {"year": 2022, "rate": 0.1237, "value": ""},
            "2023": {"year": 2023, "rate": 0.1305, "value": ""},
            "2024": {"year": 2024, "rate": 0.1087, "value": ""},
            "2025": {"year": 2025, "rate": 0.1432, "value": ""}
        }
    },
    "IMA-B": {
        "name": "IMA-B",
        "type": "index",
        "data": {
            "2003": {"year": 2003, "rate": "", "value": 811.970067},
            "2004": {"year": 2004, "rate": "", "value": 973.147219},
            "2005": {"year": 2005, "rate": "", "value": 1108.355971},
            "2006": {"year": 2006, "rate": "", "value": 1353.153246},
            "2007": {"year": 2007, "rate": "", "value": 1543.184704},
            "2008": {"year": 2008, "rate": "", "value": 1713.390080},
            "2009": {"year": 2009, "rate": "", "value": 2038.086082},
            "2010": {"year": 2010, "rate": "", "value": 2385.460775},
            "2011": {"year": 2011, "rate": "", "value": 2745.862130},
            "2012": {"year": 2012, "rate": "", "value": 3478.379033},
            "2013": {"year": 2013, "rate": "", "value": 3129.913583},
            "2014": {"year": 2014, "rate": "", "value": 3585.122707},
            "2015": {"year": 2015, "rate": "", "value": 3903.536544},
            "2016": {"year": 2016, "rate": "", "value": 4872.027519},
            "2017": {"year": 2017, "rate": "", "value": 5495.358093},
            "2018": {"year": 2018, "rate": "", "value": 6212.982518},
            "2019": {"year": 2019, "rate": "", "value": 7638.884659},
            "2020": {"year": 2020, "rate": "", "value": 8128.201373},
            "2021": {"year": 2021, "rate": "", "value": 8025.440731},
            "2022": {"year": 2022, "rate": "", "value": 8536.599187},
            "2023": {"year": 2023, "rate": "", "value": 9907.091003},
            "2024": {"year": 2024, "rate": "", "value": 9665.417696},
            "2025": {"year": 2025, "rate": "", "value": 10938.171624}
        }
    },
    "IRF-M": {
        "name": "IRF-M",
        "type": "index",
        "data": {
            "2001": {"year": 2001, "rate": "", "value": 1201.331323},
            "2002": {"year": 2002, "rate": "", "value": 1442.197427},
            "2003": {"year": 2003, "rate": "", "value": 1850.075693},
            "2004": {"year": 2004, "rate": "", "value": 2135.670267},
            "2005": {"year": 2005, "rate": "", "value": 2552.997075},
            "2006": {"year": 2006, "rate": "", "value": 3020.128034},
            "2007": {"year": 2007, "rate": "", "value": 3344.237338},
            "2008": {"year": 2008, "rate": "", "value": 3808.505507},
            "2009": {"year": 2009, "rate": "", "value": 4283.508164},
            "2010": {"year": 2010, "rate": "", "value": 4791.831607},
            "2011": {"year": 2011, "rate": "", "value": 5484.484462},
            "2012": {"year": 2012, "rate": "", "value": 6268.515822},
            "2013": {"year": 2013, "rate": "", "value": 6432.11494},
            "2014": {"year": 2014, "rate": "", "value": 7165.497928},
            "2015": {"year": 2015, "rate": "", "value": 7676.042321},
            "2016": {"year": 2016, "rate": "", "value": 9470.035125},
            "2017": {"year": 2017, "rate": "", "value": 10909.32445},
            "2018": {"year": 2018, "rate": "", "value": 12080.131148},
            "2019": {"year": 2019, "rate": "", "value": 13533.391484},
            "2020": {"year": 2020, "rate": "", "value": 14439.402355},
            "2021": {"year": 2021, "rate": "", "value": 14151.73434},
            "2022": {"year": 2022, "rate": "", "value": 15400.582715},
            "2023": {"year": 2023, "rate": "", "value": 17943.073578},
            "2024": {"year": 2024, "rate": "", "value": 18276.418562},
            "2025": {"year": 2025, "rate": "", "value": 21605.917558}
        }
    },
    "IFIX": {
        "name": "IFIX",
        "type": "index",
        "data": {
            "2011": {"year": 2011, "rate": "", "value": 1165.09},
            "2012": {"year": 2012, "rate": "", "value": 1573.34},
            "2013": {"year": 2013, "rate": "", "value": 1374.70},
            "2014": {"year": 2014, "rate": "", "value": 1336.72},
            "2015": {"year": 2015, "rate": "", "value": 1409.02},
            "2016": {"year": 2016, "rate": "", "value": 1864.62},
            "2017": {"year": 2017, "rate": "", "value": 2226.46},
            "2018": {"year": 2018, "rate": "", "value": 2351.59},
            "2019": {"year": 2019, "rate": "", "value": 3197.58},
            "2020": {"year": 2020, "rate": "", "value": 2870.15},
            "2021": {"year": 2021, "rate": "", "value": 2804.79},
            "2022": {"year": 2022, "rate": "", "value": 2867.13},
            "2023": {"year": 2023, "rate": "", "value": 3311.43},
            "2024": {"year": 2024, "rate": "", "value": 3116.28},
            "2025": {"year": 2025, "rate": "", "value": 3775.31}
        }
    },
    "SMLL": {
        "name": "SMLL",
        "type": "index",
        "data": {
            "2005": {"year": 2005, "rate": "", "value": 593.06},
            "2006": {"year": 2006, "rate": "", "value": 872.68},
            "2007": {"year": 2007, "rate": "", "value": 1054.02},
            "2008": {"year": 2008, "rate": "", "value": 493.78},
            "2009": {"year": 2009, "rate": "", "value": 1172.88},
            "2010": {"year": 2010, "rate": "", "value": 1439.56},
            "2011": {"year": 2011, "rate": "", "value": 1200.22},
            "2012": {"year": 2012, "rate": "", "value": 1544.15},
            "2013": {"year": 2013, "rate": "", "value": 1309.24},
            "2014": {"year": 2014, "rate": "", "value": 1087.35},
            "2015": {"year": 2015, "rate": "", "value": 844.10},
            "2016": {"year": 2016, "rate": "", "value": 1112.05},
            "2017": {"year": 2017, "rate": "", "value": 1660.83},
            "2018": {"year": 2018, "rate": "", "value": 1795.84},
            "2019": {"year": 2019, "rate": "", "value": 2840.97},
            "2020": {"year": 2020, "rate": "", "value": 2822.39},
            "2021": {"year": 2021, "rate": "", "value": 2365.24},
            "2022": {"year": 2022, "rate": "", "value": 2009.04},
            "2023": {"year": 2023, "rate": "", "value": 2352.98},
            "2024": {"year": 2024, "rate": "", "value": 1763.94},
            "2025": {"year": 2025, "rate": "", "value": 2305.52}
        }
    },
    "IBOV": {
        "name": "IBOV",
        "type": "index",
        "data": {
            "1999": {"year": 1999, "rate": "", "value": 17092},
            "2000": {"year": 2000, "rate": "", "value": 15259},
            "2001": {"year": 2001, "rate": "", "value": 13578},
            "2002": {"year": 2002, "rate": "", "value": 11268},
            "2003": {"year": 2003, "rate": "", "value": 22236},
            "2004": {"year": 2004, "rate": "", "value": 26196},
            "2005": {"year": 2005, "rate": "", "value": 33456},
            "2006": {"year": 2006, "rate": "", "value": 44474},
            "2007": {"year": 2007, "rate": "", "value": 63886},
            "2008": {"year": 2008, "rate": "", "value": 37550},
            "2009": {"year": 2009, "rate": "", "value": 68588},
            "2010": {"year": 2010, "rate": "", "value": 69305},
            "2011": {"year": 2011, "rate": "", "value": 56754},
            "2012": {"year": 2012, "rate": "", "value": 60952},
            "2013": {"year": 2013, "rate": "", "value": 51507},
            "2014": {"year": 2014, "rate": "", "value": 50007},
            "2015": {"year": 2015, "rate": "", "value": 43350},
            "2016": {"year": 2016, "rate": "", "value": 60227},
            "2017": {"year": 2017, "rate": "", "value": 76402},
            "2018": {"year": 2018, "rate": "", "value": 87887},
            "2019": {"year": 2019, "rate": "", "value": 115645},
            "2020": {"year": 2020, "rate": "", "value": 119017},
            "2021": {"year": 2021, "rate": "", "value": 104822},
            "2022": {"year": 2022, "rate": "", "value": 109735},
            "2023": {"year": 2023, "rate": "", "value": 134185},
            "2024": {"year": 2024, "rate": "", "value": 120283},
            "2025": {"year": 2025, "rate": "", "value": 161125}
        }
    },
    "IDIV": {
        "name": "IDIV",
        "type": "index",
        "data": {
            "2011": {"year": 2011, "rate": "", "value": 2926.66},
            "2012": {"year": 2012, "rate": "", "value": 3555.97},
            "2013": {"year": 2013, "rate": "", "value": 3405.19},
            "2014": {"year": 2014, "rate": "", "value": 2791.90},
            "2015": {"year": 2015, "rate": "", "value": 2025.43},
            "2016": {"year": 2016, "rate": "", "value": 3250.54},
            "2017": {"year": 2017, "rate": "", "value": 4072.14},
            "2018": {"year": 2018, "rate": "", "value": 4721.74},
            "2019": {"year": 2019, "rate": "", "value": 6854.14},
            "2020": {"year": 2020, "rate": "", "value": 6785.57},
            "2021": {"year": 2021, "rate": "", "value": 6350.44},
            "2022": {"year": 2022, "rate": "", "value": 7153.76},
            "2023": {"year": 2023, "rate": "", "value": 9073.81},
            "2024": {"year": 2024, "rate": "", "value": 8835.83},
            "2025": {"year": 2025, "rate": "", "value": 11485.30}
        }
    },
    "USD": {
        "name": "USD",
        "description": "USD PTAX Compra",
        "type": "Exchange",
        "data": {
            "2000": {"year": 2000, "rate": "", "value": 1.9546},
            "2001": {"year": 2001, "rate": "", "value": 2.3196},
            "2002": {"year": 2002, "rate": "", "value": 3.5325},
            "2003": {"year": 2003, "rate": "", "value": 2.8884},
            "2004": {"year": 2004, "rate": "", "value": 2.6536},
            "2005": {"year": 2005, "rate": "", "value": 2.3399},
            "2006": {"year": 2006, "rate": "", "value": 2.1372},
            "2007": {"year": 2007, "rate": "", "value": 1.7705},
            "2008": {"year": 2008, "rate": "", "value": 2.3362},
            "2009": {"year": 2009, "rate": "", "value": 1.7404},
            "2010": {"year": 2010, "rate": "", "value": 1.6654},
            "2011": {"year": 2011, "rate": "", "value": 1.8751},
            "2012": {"year": 2012, "rate": "", "value": 2.0429},
            "2013": {"year": 2013, "rate": "", "value": 2.3420},
            "2014": {"year": 2014, "rate": "", "value": 2.6556},
            "2015": {"year": 2015, "rate": "", "value": 3.9042},
            "2016": {"year": 2016, "rate": "", "value": 3.2585},
            "2017": {"year": 2017, "rate": "", "value": 3.3074},
            "2018": {"year": 2018, "rate": "", "value": 3.8742},
            "2019": {"year": 2019, "rate": "", "value": 4.0301},
            "2020": {"year": 2020, "rate": "", "value": 5.1961},
            "2021": {"year": 2021, "rate": "", "value": 5.5799},
            "2022": {"year": 2022, "rate": "", "value": 5.2171},
            "2023": {"year": 2023, "rate": "", "value": 4.8407},
            "2024": {"year": 2024, "rate": "", "value": 6.1917},
            "2025": {"year": 2025, "rate": "", "value": 5.5018}
        }
    },
    "SP 500": {
        "name": "SP 500",
        "type": "index",
        "currency": "USD",
        "data": {
            "1999": {"year": 1999, "rate": "", "value": 1469.20},
            "2000": {"year": 2000, "rate": "", "value": 1320.3},
            "2001": {"year": 2001, "rate": "", "value": 1148.1},
            "2002": {"year": 2002, "rate": "", "value": 879.8},
            "2003": {"year": 2003, "rate": "", "value": 1111.9},
            "2004": {"year": 2004, "rate": "", "value": 1211.9},
            "2005": {"year": 2005, "rate": "", "value": 1248.3},
            "2006": {"year": 2006, "rate": "", "value": 1418.3},
            "2007": {"year": 2007, "rate": "", "value": 1468.4},
            "2008": {"year": 2008, "rate": "", "value": 903.2},
            "2009": {"year": 2009, "rate": "", "value": 1115.1},
            "2010": {"year": 2010, "rate": "", "value": 1257.6},
            "2011": {"year": 2011, "rate": "", "value": 1257.6},
            "2012": {"year": 2012, "rate": "", "value": 1426.2},
            "2013": {"year": 2013, "rate": "", "value": 1848.4},
            "2014": {"year": 2014, "rate": "", "value": 2058.9},
            "2015": {"year": 2015, "rate": "", "value": 2043.94},
            "2016": {"year": 2016, "rate": "", "value": 2238.83},
            "2017": {"year": 2017, "rate": "", "value": 2673.61},
            "2018": {"year": 2018, "rate": "", "value": 2790.5},
            "2019": {"year": 2019, "rate": "", "value": 3230.78},
            "2020": {"year": 2020, "rate": "", "value": 3756.07},
            "2021": {"year": 2021, "rate": "", "value": 4766.18},
            "2022": {"year": 2022, "rate": "", "value": 3839.5},
            "2023": {"year": 2023, "rate": "", "value": 4769.83},
            "2024": {"year": 2024, "rate": "", "value": 5881.63},
            "2025": {"year": 2025, "rate": "", "value": 6845.5}
        }
    },
    "VT": {
        "name": "VT",
        "type": "etf",
        "currency": "USD",
        "data": {
            "2008": {"year": 2008, "rate": "", "value": 32.98},
            "2009": {"year": 2009, "rate": "", "value": 43.09},
            "2010": {"year": 2010, "rate": "", "value": 47.8},
            "2011": {"year": 2011, "rate": "", "value": 43.18},
            "2012": {"year": 2012, "rate": "", "value": 49.42},
            "2013": {"year": 2013, "rate": "", "value": 59.4},
            "2014": {"year": 2014, "rate": "", "value": 60.12},
            "2015": {"year": 2015, "rate": "", "value": 57.62},
            "2016": {"year": 2016, "rate": "", "value": 61.0},
            "2017": {"year": 2017, "rate": "", "value": 74.26},
            "2018": {"year": 2018, "rate": "", "value": 65.46},
            "2019": {"year": 2019, "rate": "", "value": 80.99},
            "2020": {"year": 2020, "rate": "", "value": 92.58},
            "2021": {"year": 2021, "rate": "", "value": 107.43},
            "2022": {"year": 2022, "rate": "", "value": 86.19},
            "2023": {"year": 2023, "rate": "", "value": 102.88},
            "2024": {"year": 2024, "rate": "", "value": 117.48},
            "2025": {"year": 2025, "rate": "", "value": 141.06}
        }
    }
};
