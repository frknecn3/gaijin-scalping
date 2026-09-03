import fs from 'fs';
import path from 'path';

const basisFilePath = './data/basis.json';

type BasisData = {
    [market: string]: number[];
};

function getBasisData(): BasisData {
    if (!fs.existsSync(basisFilePath)) {
        return {};
    }
    try {
        const data = fs.readFileSync(basisFilePath, 'utf-8');
        return JSON.parse(data) || {};
    } catch {
        return {};
    }
}

function saveBasisData(data: BasisData) {
    const dirPath = path.dirname(basisFilePath);
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
    fs.writeFileSync(basisFilePath, JSON.stringify(data, null, 2));
}

export function addBasis(market: string, price: number) {
    const data = getBasisData();
    if (!data[market]) {
        data[market] = [];
    }
    data[market].push(price);
    // Sort descending so highest cost basis is first
    data[market].sort((a, b) => b - a);
    saveBasisData(data);
}

export function consumeBasis(market: string) {
    const data = getBasisData();
    if (data[market] && data[market].length > 0) {
        // When a SELL order fulfills, we consume the highest cost basis.
        data[market].shift(); 
        if (data[market].length === 0) {
            delete data[market];
        }
        saveBasisData(data);
    }
}

export function getAvailableBases(market: string): number[] {
    const data = getBasisData();
    return data[market] || [];
}
