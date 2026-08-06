# Test report — v5.36 STACK FIRST

- El optimizador principal permanece separado del flujo opcional de apilamiento.
- Buscar apilamiento parte de todas las cantidades originales, no del orden del plano actual.
- Las medidas grandes se usan como base y las pequeñas como capas superiores con apoyo completo.
- El límite de cada pila mixta es el máximo más bajo de sus capas.
- Se admiten cantidades parciales para aprovechar sobrantes.
- Después de formar pilas mixtas, el motor vuelve a optimizar desde cero.
- El plano normal se restaura si la alternativa apilada no carga más pallets.
- JavaScript y ZIP validados.
