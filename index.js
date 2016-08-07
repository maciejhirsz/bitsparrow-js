(function() {
    'use strict';

    // Simple way to detect if running under Node.js
    var IS_NODE = typeof window !== "object" && typeof global === "object";
    var BufferType = IS_NODE ? Buffer : Uint8Array;

    var TextEncoder = typeof window === 'object' ? window.TextEncoder : null;
    if (TextEncoder == null) {
        TextEncoder = function TextEncoder() {}

        TextEncoder.prototype = {
            encode: function(string) {
                string = encodeURIComponent(string);
                var len = string.length;
                var bytes = [];
                var c;

                for (var i = 0; i < len; i++) {
                    c = string.charCodeAt(i);

                    // 37 is '%'                   string.substring(i + 1, i + 2); i += 2
                    bytes.push(c === 37 ? parseInt(string.substring(++i, ++i + 1), 16) : c);
                }

                return bytes;
            }
        };
    }

    function decodeUtf8Char(str) {
        try {
            return decodeURIComponent(str);
        } catch (err) {
            return String.fromCharCode(0xFFFD); // UTF 8 invalid char
        }
    }


    // TextDecoder fallback using logic from:
    // https://github.com/feross/buffer/bytes/master/index.js
    var TextDecoder = typeof window === 'object' ? window.TextDecoder : null;
    if (TextDecoder == null) {
        TextDecoder = function TextDecoder() {}

        TextDecoder.prototype = {
            decode: function(buffer) {
                var result = '',
                    temp = '',
                    length = buffer.length,
                    i = 0;

                for (; i < length; i++) {
                    if (buffer[i] < 128) {
                        if (temp !== '') {
                            result += decodeUtf8Char(temp);
                            temp = '';
                        }
                        result += String.fromCharCode(buffer[i]);
                    } else {
                        temp += '%' + buffer[i].toString(16);
                    }
                }

                return result + decodeUtf8Char(temp);
            },
        };
    }

    var strToSlice = IS_NODE ? function (str) {
        return new Buffer(str);
    } : (function () {
        var encoder = new TextEncoder('utf-8');
        return function (str) {
            return encoder.encode(str);
        }
    })();

    var sliceToStr = IS_NODE ? function (slice) {
        return slice.toString();
    } : (function () {
        var decoder = new TextDecoder('utf-8');
        return function (str) {
            return decoder.decode(str);
        }
    })();

    // Helper bufferfer and views to easily and cheapily convert types
    var buffer = new ArrayBuffer(8),
        u8arr  = new Uint8Array(buffer),
        u16arr = new Uint16Array(buffer),
        u32arr = new Uint32Array(buffer),
        i8arr  = new Int8Array(buffer),
        i16arr = new Int16Array(buffer),
        i32arr = new Int32Array(buffer),
        f32arr = new Float32Array(buffer),
        f64arr = new Float64Array(buffer);

    function writeType16(value, data, tarr) {
        tarr[0] = value;
        data.push(u8arr[1]);
        data.push(u8arr[0]);
    }

    function writeType32(value, data, tarr) {
        tarr[0] = value;
        data.push(u8arr[3]);
        data.push(u8arr[2]);
        data.push(u8arr[1]);
        data.push(u8arr[0]);
    }

    function writeType64(value, data, tarr) {
        tarr[0] = value;
        data.push(u8arr[7]);
        data.push(u8arr[6]);
        data.push(u8arr[5]);
        data.push(u8arr[4]);
        data.push(u8arr[3]);
        data.push(u8arr[2]);
        data.push(u8arr[1]);
        data.push(u8arr[0]);
    }

    function readType16(decoder, tarr) {
        var end = decoder.index + 2;
        if (end > decoder.length) throw new Error("Reading out of boundary");
        var data = decoder.data;
        var index = decoder.index;
        decoder.index = end;
        u8arr[1] = data[index];
        u8arr[0] = data[index + 1];
        return tarr[0];
    }

    function readType32(decoder, tarr) {
        var end = decoder.index + 4;
        if (end > decoder.length) throw new Error("Reading out of boundary");
        var data = decoder.data;
        var index = decoder.index;
        decoder.index = end;
        u8arr[3] = data[index];
        u8arr[2] = data[index + 1];
        u8arr[1] = data[index + 2];
        u8arr[0] = data[index + 3];
        return tarr[0];
    }

    function readType64(decoder, tarr) {
        var end = decoder.index + 8;
        if (end > decoder.length) throw new Error("Reading out of boundary");
        var data = decoder.data;
        var index = decoder.index;
        decoder.index = end;
        u8arr[7] = data[index];
        u8arr[6] = data[index + 1];
        u8arr[5] = data[index + 2];
        u8arr[4] = data[index + 3];
        u8arr[3] = data[index + 4];
        u8arr[2] = data[index + 5];
        u8arr[1] = data[index + 6];
        u8arr[0] = data[index + 7];
        return tarr[0];
    }

    // Because JavaScript Number type has enough bits to store 53 bit precision
    // integers, but can only do binary operations on 32 bit *SIGNED* integers,
    // all would-be-bitwise-operations on anything larger than 16 bit *UNSIGNED*
    // integer needs to use floating point arithmetic - sad panda :(.
    function brshift16(n) {
        return Math.floor(n / 0x10000);
    }

    function brshift32(n) {
        return Math.floor(n / 0x100000000);
    }

    function brshift48(n) {
        return Math.floor(n / 0x1000000000000)
    }


    function Encoder() {
        this.data = [];
        this.boolIndex = -1;
        this.boolShift = 0;
    }

    Encoder.prototype = {
        uint8: function(uint8) {
            this.data.push(uint8);
            return this;
        },

        uint16: function(uint16) {
            this.data.push(uint16 >>> 8, uint16 & 0xFF);
            return this;
        },

        uint32: function(uint32) {
            writeType32(uint32, this.data, u32arr);
            return this;
        },

        uint64: function(uint64) {
            writeType32(brshift32(uint64), this.data, u32arr);
            writeType32(uint64, this.data, u32arr);
            return this;
        },

        int8: function(int8) {
            i8arr[0] = int8;
            this.data.push(u8arr[0]);
            return this;
        },

        int16: function(int16) {
            writeType16(int16, this.data, i16arr);
            return this;
        },

        int32: function(int32) {
            writeType32(int32, this.data, i32arr);
            return this;
        },

        int64: function(int64) {
            writeType32(brshift32(int64), this.data, i32arr);
            var low = int64 % 0x100000000;
            writeType32(low < 0 ? low + 0x100000000 : low, this.data, u32arr);
            return this;
        },

        float32: function(float32) {
            writeType32(float32, this.data, f32arr);
            return this;
        },

        float64: function(float64) {
            writeType64(float64, this.data, f64arr);
            return this;
        },

        bool: function(bool) {
            var bits,
                bool_bit = bool ? 1 : 0,
                index = this.data.length;

            if (this.boolIndex == index && this.boolShift < 7) {
                this.boolShift += 1;
                bits = this.data[index - 1];
                bits = bits | bool_bit << this.boolShift;
                this.data[index - 1] = bits;
                return this;
            }

            this.boolIndex = index + 1;
            this.boolShift = 0;
            return this.uint8(bool_bit);
        },

        size: function(size) {
            // Max safe integer
            if (size > 0x1FFFFFFFFFFFFF) {
                throw new Error("Provided size is too long!");
            }

            var data = this.data;

            if (size < 0x80) {
                // 1 byte
                data.push(size);
            } else if (size < 0x4000) {
                // 2 bytes
                data.push((size >> 8) | 0x80);
                data.push(size & 0xFF);
            } else if (size < 0x200000) {
                // 3 bytes
                u32arr[0] = size;
                data.push(u8arr[2] | 0xC0);
                data.push(u8arr[1]);
                data.push(u8arr[0]);
            } else if (size <= 0x10000000) {
                // 4 bytes
                u32arr[0] = size;
                data.push(u8arr[3] | 0xE0);
                data.push(u8arr[2]);
                data.push(u8arr[1]);
                data.push(u8arr[0]);
            } else if (size <= 0x800000000) {
                // 5 bytes
                data.push(brshift32(size) | 0xF0);
                writeType32(size, data, u32arr);
            } else if (size <= 0x40000000000) {
                // 6 bytes
                writeType16(brshift32(size) | 0xF800, data, u16arr);
                writeType32(size, data, u32arr);
            } else if (size <= 0x2000000000000) {
                // 7 bytes
                data.push(brshift48(size) | 0xFC);
                writeType16(brshift32(size) & 0xFFFF, data, u16arr);
                writeType32(size, data, u32arr);
            } else {
                // 8 bytes
                writeType16(brshift48(size) | 0xFE00, data, u16arr);
                writeType16(brshift32(size) % 0x100000000, data, u16arr);
                writeType32(size, data, u32arr);
            }

            return this;
        },

        bytes: function(bytes) {
            var len = bytes.length;
            var data = this.data;
            var i = 0;

            this.size(len);
            for (; i < len; i++) data.push(bytes[i]);

            return this;
        },

        string: function(string) {
            return this.bytes(strToSlice(string));
        },

        end: function() {
            var len = this.data.length;
            var data = new BufferType(this.data);

            this.data = [];
            return data;
        }
    };

    function Decoder(data) {
        if (data == null || data.length == null) throw new Error("Invalid type");
        this.data = data;
        this.index = 0;
        this.length = data.length;
        this.boolIndex = -1;
        this.boolShift = 0;
    }

    Decoder.prototype = {
        uint8: function() {
            if (this.index >= this.length) throw new Error("Reading out of boundary");
            var uint8 = this.data[this.index];
            this.index += 1;
            return uint8;
        },

        uint16: function() {
            return readType16(this, u16arr);
        },

        uint32: function() {
            return readType32(this, u32arr);
        },

        uint64: function() {
            var uint64 = readType32(this, u32arr) * 0x100000000;
            return uint64 + readType32(this, u32arr);
        },

        int8: function() {
            u8arr[0] = this.uint8();
            return i8arr[0];
        },

        int16: function() {
            return readType16(this, i16arr);
        },

        int32: function() {
            return readType32(this, i32arr);
        },

        int64: function() {
            var high = readType32(this, u32arr);
            var low = readType32(this, u32arr);

            if (high > 0x7FFFFFFF) {
                high -= 0xFFFFFFFF;
                low -= 0x100000000;
            }

            return high * 0x100000000 + low;
        },

        float32: function() {
            return readType32(this, f32arr);
        },

        float64: function() {
            return readType64(this, f64arr);
        },

        bool: function() {
            var bits;
            if (this.boolIndex == this.index && this.boolShift < 7) {
                this.boolShift += 1;
                bits = this.data[this.index - 1];
                var bool_bit = 1 << this.boolShift;
                return (bits & bool_bit) == bool_bit;
            }
            var bits = this.uint8();
            this.boolIndex = this.index;
            this.boolShift = 0;
            return (bits & 1) == 1;
        },

        size: function() {
            var size = this.uint8();

            // 1 byte (no signature)
            if ((size & 128) === 0) return size;

            var ext_bytes = 1;
            size ^= 128;

            var allowance = 64;

            while (allowance && (size & allowance)) {
                size ^= allowance;
                allowance >>= 1;
                ext_bytes += 1;
            }

            if (ext_bytes > 7) {
                throw new Error("Can't read size out of 53 bit range!");
            }

            while (ext_bytes) {
                ext_bytes -= 1;
                // Use regular math in case we run out of int32 precision
                size = (size * 256) + this.uint8();
            }

            return size;
        },

        bytes: function() {
            var size = this.size();
            if (this.index + size > this.length) throw new Error("Reading out of boundary");
            var bytes = IS_NODE ? this.data.slice(this.index, this.index + size)
                                : this.data.subarray(this.index, this.index + size);

            this.index += size;

            return bytes;
        },

        string: function() {
            var bytes = this.bytes();
            return sliceToStr(new BufferType(bytes));
        },

        end: function() {
            return this.index >= this.length;
        }
    };

    if (module.exports != null && exports === module.exports) {
        exports.Encoder = Encoder;
        exports.Decoder = Decoder;
    } else {
        window.bitsparrow = {
            Encoder: Encoder,
            Decoder: Decoder,
        }
    }
})();
