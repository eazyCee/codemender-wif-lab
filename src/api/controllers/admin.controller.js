const adminService = require('../../services/admin.service');

function safeEvalFormula(expr) {
    if (typeof expr === 'number') {
        if (!Number.isFinite(expr)) throw new Error("Invalid number");
        return expr;
    }
    if (typeof expr !== 'string') {
        throw new Error("Invalid formula");
    }

    const tokens = [];
    let i = 0;
    while (i < expr.length) {
        const ch = expr[i];
        if (/\s/.test(ch)) {
            i++;
            continue;
        }
        if (/[0-9.]/.test(ch)) {
            let numStr = '';
            let dotCount = 0;
            while (i < expr.length && /[0-9.]/.test(expr[i])) {
                if (expr[i] === '.') dotCount++;
                if (dotCount > 1) throw new Error("Invalid number format");
                numStr += expr[i];
                i++;
            }
            if (numStr === '.') throw new Error("Invalid number format");
            tokens.push({ type: 'NUMBER', value: parseFloat(numStr) });
            continue;
        }
        if ("+-*/%()".includes(ch)) {
            tokens.push({ type: ch });
            i++;
            continue;
        }
        throw new Error("Invalid character: " + ch);
    }

    if (tokens.length === 0) {
        throw new Error("Empty formula");
    }

    let pos = 0;
    function peek() {
        return tokens[pos];
    }
    function consume(expectedType) {
        const token = tokens[pos];
        if (!token || (expectedType && token.type !== expectedType)) {
            throw new Error("Unexpected token");
        }
        pos++;
        return token;
    }

    function parseExpression() {
        let left = parseTerm();
        while (pos < tokens.length && (peek().type === '+' || peek().type === '-')) {
            const op = consume().type;
            const right = parseTerm();
            if (op === '+') left += right;
            else left -= right;
        }
        return left;
    }

    function parseTerm() {
        let left = parseFactor();
        while (pos < tokens.length && (peek().type === '*' || peek().type === '/' || peek().type === '%')) {
            const op = consume().type;
            const right = parseFactor();
            if (op === '*') left *= right;
            else if (op === '/') {
                if (right === 0) throw new Error("Division by zero");
                left /= right;
            } else if (op === '%') {
                if (right === 0) throw new Error("Division by zero");
                left %= right;
            }
        }
        return left;
    }

    function parseFactor() {
        const token = peek();
        if (!token) throw new Error("Unexpected end of expression");
        if (token.type === '+') {
            consume('+');
            return parseFactor();
        }
        if (token.type === '-') {
            consume('-');
            return -parseFactor();
        }
        if (token.type === '(') {
            consume('(');
            const val = parseExpression();
            consume(')');
            return val;
        }
        if (token.type === 'NUMBER') {
            return consume('NUMBER').value;
        }
        throw new Error("Unexpected token: " + token.type);
    }

    const result = parseExpression();
    if (pos < tokens.length) {
        throw new Error("Unexpected trailing tokens");
    }
    if (!Number.isFinite(result)) {
        throw new Error("Result is not a finite number");
    }
    return result;
}

exports.checkShippingStatus = (req, res) => {
    adminService.pingProvider(req.body.providerIP, req.body.options, out => res.send(out));
};

exports.previewDynamicPricing = (req, res) => {
    try {
        const formula = req.body && req.body.formula;
        res.json({ price: safeEvalFormula(formula) });
    } catch (e) {
        res.status(400).send("Evaluation Failed");
    }
};
