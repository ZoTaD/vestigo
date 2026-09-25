# Avisos de terceros del motor del mapa de Valheim

Los archivos de esta carpeta son un port a TypeScript de partes de
[Valheim-SeedLab](https://github.com/DoomMachine/Valheim-SeedLab) (generador de mundo, funciones
nativas de Unity, hash de la semilla y colores del mapa). Cada archivo portado
indica en su primera línea de qué archivo de SeedLab viene.

## Valheim-SeedLab

```
MIT License

Copyright (c) 2026 DoomMachine

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## FastNoise

`fastNoiseTables.ts` y `fastNoise.ts` reproducen parte de FastNoise, de Jordan
Peck, tal como lo trae Valheim: las tablas de gradientes y celdas y las rutinas
de ruido celular y simplex fractal. El proyecto original es
https://github.com/Auburn/FastNoise_CSharp, con licencia MIT:

```
MIT License

Copyright (c) 2016 Jordan Peck

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Valheim

Valheim es de Iron Gate AB y lo publica Coffee Stain; "Valheim" es marca de
Iron Gate AB. Ni SeedLab ni Vestigo están afiliados a Iron Gate ni a Coffee
Stain. Este motor reimplementa la generación de mundo para reproducirla fuera
del juego y no contiene recursos del juego.
