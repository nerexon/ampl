String.prototype.isAlpha = function (this: string): boolean {
    return /^[a-zA-Z]+$/.test(this);
};

String.prototype.isNumber = function (this: string): boolean {
    return /^[0-9]+$/.test(this);
};

class Reader {
    filePath: string;
    file?: ReturnType<typeof Bun.file>;

    constructor(filePath: string) {
        this.filePath = filePath;
    }

    read() {
        this.file = Bun.file(this.filePath);
        return this.file.text();
    }
}

class Tokenizer {
    input: string;
    output: any[];

    constructor(input: string) {
        this.input = input;
        this.output = [];
    }

    async tokenize() {
        let buff = "";
        let i = 0;

        const keywords = ["USING", "FUNCTION", "EXIT"];
        const symbols = ["(", ")", "{", "}", ";", ":", ","];
        
        while (i < this.input.length) {
            const char = this.input.at(i);

            // Ensure we have a valid character to process
            if (!char) {
                i++;
                continue;
            }

            // If character is alphabetic, it's part of a keyword/identifier
            if (char.isAlpha()) {
                buff += char;
            } 
            // If character is a number, it's part of a number
            else if (char.isNumber()) {
                buff += char;
            } 
            // Handle string literals
            else if (char === '"') {
                let stringLiteral = '"';
                i++; // Skip the opening quote
                while (i < this.input.length && this.input.at(i) !== '"') {
                    stringLiteral += this.input.at(i);
                    i++;
                }
                stringLiteral += '"'; // Close the string literal
                this.output.push({ type: "string", value: stringLiteral });
                i++; // Skip the closing quote
                continue;
            } 
            // Handle symbols (e.g., parentheses, braces, semicolons)
            else if (symbols.includes(char)) {
                if (buff.length > 0) {
                    // Handle completed keyword or identifier from buffer
                    this.handleBuffer(buff);
                    buff = ""; // Clear buffer after handling it
                }
                this.output.push({ type: "symbol", value: char });
            }
            // Handle whitespace (skip it)
            else if (/\s/.test(char)) {
                if (buff.length > 0) {
                    // Handle completed keyword or identifier from buffer
                    this.handleBuffer(buff);
                    buff = ""; // Clear buffer after handling it
                }
            } 
            // Handle other unknown characters
            else {
                this.output.push({ type: "unknown", value: char });
            }
            
            i++;
        }

        // If there's anything left in the buffer (e.g., an identifier at the end)
        if (buff.length > 0) {
            this.handleBuffer(buff);
        }

        console.log(this.output);
    }

    // Helper function to classify keywords or identifiers
    handleBuffer(buff: string) {
        const keywords = ["USING", "FUNCTION", "EXIT"];

        if (keywords.includes(buff.toUpperCase())) {
            this.output.push({ type: "keyword", value: buff.toUpperCase() });
        } else {
            this.output.push({ type: "identifier", value: buff });
        }
    }
}

const initialReader = new Reader("test.ampl");
const initialContent = await initialReader.read();

const tokenizer = new Tokenizer(initialContent);
await tokenizer.tokenize();
