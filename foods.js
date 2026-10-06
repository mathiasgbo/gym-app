// Base de alimentos comunes de Argentina y Uruguay.
// Valores aproximados cada 100 g (de tablas públicas de composición: USDA y tablas regionales),
// en el estado en que se come (cocido, a la plancha, etc., según indica el nombre).
//
// Formato de cada línea: id · nombre · categoría · kcal, proteína, hidratos, grasa · porciones · sinónimos
//   categoría: prot | hc | veg | fruta | grasa | mix (plato combinado) | otro
//   porciones: "etiqueta:gramos|etiqueta:gramos" (la primera es la porción por defecto)
import { state, num } from './store.js';

const RAW = `
carne-picada|Carne picada magra (cocida)|prot|215,27,0,12|1 porción:150|1 hamburguesa casera:100|picada
bife-cuadril|Bife de cuadril (a la plancha)|prot|190,29,0,8|1 bife:180|1 bife chico:120|cuadril
lomo|Lomo (a la plancha)|prot|180,29,0,7|1 bife:180|1 medallón:120|
nalga|Nalga / bola de lomo (a la plancha)|prot|170,30,0,5.5|1 bife:150|2 bifes:250|bola de lomo
cuadrada|Cuadrada (a la plancha)|prot|165,30,0,4.5|1 bife:150|2 bifes:250|
peceto|Peceto (al horno)|prot|160,31,0,4|1 porción:150|2 rodajas:100|vitel
bife-ancho|Bife ancho / ojo de bife|prot|250,26,0,16|1 bife:250|1 bife chico:150|ojo de bife
bife-chorizo|Bife de chorizo / bife angosto|prot|230,27,0,13|1 bife:300|1 bife chico:180|bife angosto
asado-tira|Asado de tira|prot|330,22,0,27|1 tira:200|1 porción chica:120|asado
vacio|Vacío|prot|290,25,0,21|1 porción:200|1 porción chica:120|
matambre|Matambre (asado)|prot|260,27,0,17|1 porción:150||
entrana|Entraña|prot|280,24,0,20|1 porción:150||
colita-cuadril|Colita de cuadril|prot|200,29,0,9|1 porción:180||
osobuco|Osobuco (cocido)|prot|230,30,0,12|1 porción:200||
higado|Hígado vacuno|prot|175,27,5,5|1 bife:120||
milanesa-carne|Milanesa de carne (frita)|prot|290,19,15,17|1 milanesa mediana:120|1 milanesa grande:180|milanga
milanesa-carne-horno|Milanesa de carne (al horno)|prot|230,21,15,9|1 milanesa mediana:120|1 milanesa grande:180|milanga
milanesa-pollo|Milanesa de pollo (al horno)|prot|215,23,13,8|1 milanesa mediana:120|1 milanesa grande:180|suprema
milanesa-pollo-frita|Milanesa de pollo (frita)|prot|265,20,14,14|1 milanesa mediana:120|1 milanesa grande:180|suprema
milanesa-soja|Milanesa de soja|prot|230,12,25,9|1 milanesa:100||
pechuga|Pechuga de pollo (a la plancha)|prot|165,31,0,3.6|1 pechuga grande:200|1 pechuga chica:130|100 g:100|pollo
pata-muslo|Pata-muslo de pollo (al horno, sin piel)|prot|190,26,0,9|1 pata-muslo:150|2 muslos chicos:180|pollo
pollo-piel|Pollo al horno con piel|prot|240,25,0,15|1 cuarto de pollo:250|1 presa:150|pollo
solomillo|Solomillo de cerdo|prot|145,26,0,4|1 solomillo:200|1 porción:150|cerdo
bondiola|Bondiola de cerdo|prot|270,23,0,19|1 porción:150||cerdo
costeleta-cerdo|Carré / costeleta de cerdo|prot|210,27,0,11|1 costeleta:150||cerdo carre
matambrito|Matambrito de cerdo|prot|270,24,0,19|1 porción:150||cerdo
chorizo|Chorizo parrillero|prot|320,15,2,28|1 chorizo:100||chori
morcilla|Morcilla|prot|330,14,13,25|1 morcilla:100||
salchicha|Salchicha tipo viena|prot|280,11,4,25|1 salchicha:45|2 salchichas:90|pancho
jamon-cocido|Jamón cocido|prot|120,18,2,4.5|1 feta:20|2 fetas:40|fiambre
lomito|Lomito / lomo horneado (fiambre)|prot|110,20,1,3|1 feta:20|2 fetas:40|fiambre lomo
jamon-crudo|Jamón crudo|prot|250,26,0,16|1 feta:15|3 fetas:45|fiambre
paleta|Paleta cocida|prot|130,16,2,6|1 feta:20|2 fetas:40|fiambre
salame|Salame|prot|400,22,2,34|5 rodajas:25|picada fiambre
mortadela|Mortadela|prot|310,14,3,27|1 feta:20||fiambre
merluza|Merluza (al horno)|prot|90,19,0,1.3|1 filet:150||pescado
merluza-rebozada|Filet de merluza rebozado (frito)|prot|230,14,15,13|1 filet:150||pescado
salmon|Salmón (al horno)|prot|206,22,0,13|1 porción:150||pescado
atun-agua|Atún al natural (lata)|prot|116,26,0,1|1 lata escurrida:120|media lata:60|lata pescado
atun-aceite|Atún en aceite (escurrido)|prot|198,29,0,8|1 lata escurrida:120|media lata:60|lata pescado
caballa|Caballa (lata)|prot|190,20,0,12|1 lata:125||lata pescado
sardinas|Sardinas en aceite (lata)|prot|208,25,0,11|1 lata:90||lata pescado
rabas|Rabas (fritas)|prot|260,15,12,16|1 porción:150||calamar
langostinos|Langostinos / camarones|prot|100,21,0,1.5|1 porción:120||mariscos
huevo|Huevo|prot|143,12.6,0.7,9.5|1 huevo:50|2 huevos:100|3 huevos:150|huevo duro revuelto
clara|Clara de huevo|prot|52,11,0.7,0.2|1 clara:33|3 claras:100|
omelette|Omelette / revuelto de 2 huevos (con aceite)|prot|190,12,1,15|1 omelette:110||huevo
tofu|Tofu|prot|120,13,2,7|1 porción:100||
seitan|Seitán|prot|120,24,4,1|1 porción:100||
soja-texturizada|Soja texturizada (hidratada)|prot|110,17,10,0.3|1 porción:120||
hamburguesa|Hamburguesa de carne (tipo Paty)|prot|250,15,3,20|1 medallón:80|2 medallones:160|paty
medallon-pollo|Medallón de pollo rebozado|prot|240,14,15,14|1 medallón:70||nugget
whey|Proteína en polvo (whey)|prot|380,75,8,5|1 scoop:30||suplemento proteina
hummus|Hummus de garbanzo|prot|166,8,14,10|2 cdas colmadas:50|1 cda:20|
leche|Leche entera|otro|61,3.2,4.8,3.3|1 taza:250|1 vaso:200|1 chorrito:50|
leche-desc|Leche descremada|otro|35,3.4,5,0.1|1 taza:250|1 vaso:200|1 chorrito:50|
yogur-desc|Yogur descremado natural|prot|40,4,5.5,0.1|1 pote:190||yogurt
yogur-entero|Yogur entero natural|prot|61,3.5,4.7,3.3|1 pote:190||yogurt
yogur-bebible|Yogur bebible|otro|80,2.8,12,2.4|1 vaso:200||yogurt
yogur-griego|Yogur griego natural|prot|97,9,4,5|1 pote:160||yogurt
yogur-proteico|Yogur proteico|prot|75,10,6,1|1 pote:160||yogurt
queso-untable|Queso untable / queso crema|grasa|250,6,4,24|1 cda:15|2 cdas:30|casancrem
queso-untable-light|Queso untable light|prot|130,11,5,8|1 cda:15|2 cdas:30|casancrem
ricota|Ricota|prot|140,11,3.5,9|2 cdas:60|1 porción:100|ricotta
ricota-desc|Ricota descremada|prot|95,12,4,3.5|2 cdas:60|1 porción:100|ricotta
port-salut-light|Queso port salut light|prot|230,22,1,15|1 feta:25|1 porción caja de fósforos:30|queso
cremoso|Queso cremoso|prot|300,19,1,25|1 porción:30||queso
muzzarella|Muzzarella|prot|280,22,2,21|1 porción:30|1 feta:20|queso mozzarella
tybo|Queso tybo / dambo (de máquina)|prot|340,25,1,26|1 feta:20|2 fetas:40|queso
gouda|Queso gouda|prot|356,25,2,27|1 porción:30||queso
queso-rallado|Queso rallado (reggianito)|grasa|400,33,3,28|1 cda:10||parmesano queso
dulce-leche|Dulce de leche|otro|315,7,55,7.5|1 cda:20|1 cdita:8|
crema|Crema de leche|grasa|340,2,3,35|1 cda:15||
manteca|Manteca|grasa|717,0.9,0.1,81|1 cdita:5|1 cda:14|mantequilla
helado|Helado de crema|otro|210,3.5,25,11|1 bocha:70|1/4 kg:250|
pan-frances|Pan francés|hc|270,9,55,1.5|1 mignon:40|1 pan francés:60|1 rodaja:25|flauta baguette
pan-lactal|Pan lactal blanco|hc|265,8,49,3.5|1 rodaja:25|2 rodajas:50|pan de molde
pan-lactal-integral|Pan lactal integral|hc|250,10,43,4|1 rodaja:25|3 rodajas:75|pan de molde tostada
pan-hamburguesa|Pan de hamburguesa|hc|270,9,49,4.5|1 pan:60||
pan-pancho|Pan de pancho|hc|270,8,50,4|1 pan:50||
galletitas-agua|Galletitas de agua|hc|420,10,72,10|3 galletitas:20|1 paquetito:40|criollitas
galletas-arroz|Galletas de arroz|hc|385,8,81,3|1 galleta:9|3 galletas:27|
rapidita|Rapidita / tortilla de trigo|hc|300,8,50,7|1 unidad:40|2 unidades:80|wrap tortilla
rapidita-integral|Rapidita integral|hc|290,9,46,7|1 unidad:40|2 unidades:80|wrap tortilla
grisines|Grisines|hc|410,12,70,9|5 grisines:20||
avena|Avena arrollada|hc|380,13,66,7|4 cdas:40|1 cda:10|1/2 taza:45|
granola|Granola|hc|450,10,64,17|4 cdas:40|1 cda:10|
copos|Copos de maíz sin azúcar|hc|370,7,84,1|1 taza:30||cereal corn flakes
arroz|Arroz blanco (cocido)|hc|130,2.7,28,0.3|7 cdas:200|1 taza:160|1 porción:150|
arroz-integral|Arroz integral (cocido)|hc|112,2.6,23,0.9|7 cdas:200|1 taza:160|
fideos|Fideos (cocidos)|hc|158,5.8,31,0.9|1 plato:180|1 taza:140|pasta spaghetti tallarines
fideos-integrales|Fideos integrales (cocidos)|hc|150,6,30,1.2|1 plato:180|1 taza:140|pasta
noquis|Ñoquis de papa (cocidos)|hc|135,3,28,1|1 plato:250||noquis gnocchi
polenta|Polenta (cocida)|hc|70,1.6,15,0.3|1 plato:250||
papa|Papa hervida|hc|87,1.9,20,0.1|1 papa grande:200|1 papa mediana:150|
papa-horno|Papas al horno (con aceite)|hc|130,2.5,21,4|1 porción:200||
pure|Puré de papa (con leche y manteca)|hc|105,2,16,4|1 porción:200||
papas-fritas|Papas fritas|hc|312,3.4,41,15|1 porción:150|1 porción chica:100|
batata|Batata (al horno)|hc|90,2,21,0.2|1 batata grande:200|1 batata mediana:150|boniato
choclo|Choclo (cocido)|hc|96,3.4,21,1.5|1 choclo:150|7 cdas de granos:100|maiz
quinoa|Quinoa (cocida)|hc|120,4.4,21,1.9|7 cdas:200||
lentejas|Lentejas (cocidas)|hc|116,9,20,0.4|7 cdas:200||legumbres
garbanzos|Garbanzos (cocidos)|hc|164,8.9,27,2.6|7 cdas:200||legumbres
porotos|Porotos (cocidos)|hc|127,8.7,23,0.5|7 cdas:200||legumbres frijoles
arvejas|Arvejas (cocidas)|hc|84,5.4,15,0.2|7 cdas:200|1 lata escurrida:200|legumbres
mandioca|Mandioca (hervida)|hc|160,1.4,38,0.3|1 porción:150||yuca
medialuna|Medialuna de manteca|mix|410,7,48,21|1 medialuna:45||factura
factura|Factura (bola de fraile, vigilante…)|mix|400,6,50,19|1 factura:55||
torta-frita|Torta frita|mix|380,7,48,18|1 torta frita:60||
bizcocho-uy|Bizcochos (Uruguay)|mix|430,7,50,22|1 bizcocho:40||croissant
bizcochitos|Bizcochitos de grasa|mix|520,8,58,28|10 bizcochitos:30||don satur
pizza|Pizza de muzzarella|mix|270,11,32,11|1 porción:120|2 porciones:240|
faina|Fainá|mix|230,8,26,10|1 porción:100||faina
empanada-carne|Empanada de carne (al horno)|mix|260,10,26,13|1 empanada:90|3 empanadas:270|
empanada-jyq|Empanada de jamón y queso|mix|280,11,28,14|1 empanada:90|3 empanadas:270|
empanada-pollo|Empanada de pollo|mix|240,11,26,10|1 empanada:90|3 empanadas:270|
empanada-verdura|Empanada de verdura|mix|230,8,26,10|1 empanada:90|3 empanadas:270|
tarta-verdura|Tarta de verdura|mix|220,8,20,12|1 porción:150||pascualina
tarta-jyq|Tarta de jamón y queso|mix|270,11,20,16|1 porción:150||
tortilla-papa|Tortilla de papas|mix|160,6,14,9|1 porción:150||tortilla española
ravioles|Ravioles de ricota y verdura (cocidos)|mix|200,8,28,6|1 plato:250||pasta
sorrentinos|Sorrentinos de jamón y queso (cocidos)|mix|230,10,28,8|1 plato:250||pasta
lasana|Lasaña / canelones (con salsa)|mix|160,8,15,8|1 porción:300||canelones pasta
chivito|Chivito al pan (Uruguay)|mix|260,14,18,15|1 chivito:350||
choripan|Choripán|mix|300,12,25,17|1 choripán:180||chori
pancho|Pancho (con pan)|mix|270,9,28,14|1 pancho:100||hot dog
hamburguesa-completa|Hamburguesa con pan y queso|mix|250,13,22,12|1 hamburguesa:200||
milanesa-napo|Milanesa a la napolitana|mix|250,17,12,15|1 porción:250||milanga
sandwich-miga|Sándwich de miga de jamón y queso|mix|280,11,26,15|1 triple:100|1 simple:50|
tostado|Tostado de jamón y queso|mix|270,13,27,12|1 tostado:150||carlitos
guiso-lentejas|Guiso de lentejas|mix|110,6,12,4|1 plato:350||
locro|Locro|mix|120,6,11,6|1 plato:350||
puchero|Puchero|mix|90,7,7,4|1 plato:400||
arroz-pollo|Arroz con pollo|mix|140,9,17,4|1 plato:350||
revuelto-gramajo|Revuelto gramajo|mix|210,8,13,14|1 porción:250||
pastel-papa|Pastel de papa|mix|130,7,11,6.5|1 porción:300||
pollo-verduras|Pollo con verduras al horno|mix|120,14,6,4.5|1 plato:350||
wok-verduras|Salteado de verduras con pollo|mix|110,11,7,4|1 plato:300||wok
lechuga|Lechuga|veg|15,1.4,2.9,0.2|1 plato:50||ensalada
tomate|Tomate|veg|18,0.9,3.9,0.2|1 tomate mediano:120|1/2 tomate:60|ensalada
zanahoria|Zanahoria|veg|41,0.9,10,0.2|1 zanahoria:80|1 taza rallada:100|ensalada
cebolla|Cebolla|veg|40,1.1,9.3,0.1|1 cebolla mediana:110|1/2 cebolla:55|
morron|Morrón|veg|26,1,6,0.3|1 morrón:150|1/2 morrón:75|pimiento
zapallo|Zapallo / calabaza|veg|26,1,6.5,0.1|1 porción:200||calabaza
zapallito|Zapallito / zucchini|veg|17,1.2,3.1,0.3|1 zapallito:150||zucchini
berenjena|Berenjena|veg|25,1,6,0.2|1 berenjena:250|1 porción:150|
espinaca|Espinaca (cocida)|veg|23,3,3.8,0.3|1 taza:180||
acelga|Acelga (cocida)|veg|20,1.9,4,0.1|1 taza:180||
brocoli|Brócoli|veg|35,2.4,7,0.4|1 taza:150||brocoli
coliflor|Coliflor|veg|25,1.9,5,0.3|1 taza:150||
chauchas|Chauchas|veg|31,1.8,7,0.2|1 taza:125||judias
remolacha|Remolacha|veg|43,1.6,10,0.2|1 remolacha:100||
pepino|Pepino|veg|15,0.7,3.6,0.1|1 pepino:200|1/2 pepino:100|
rucula|Rúcula|veg|25,2.6,3.7,0.7|1 plato:40||
repollo|Repollo|veg|25,1.3,6,0.1|1 taza:90||
champinones|Champiñones|veg|22,3.1,3.3,0.3|1 taza:90||hongos
ensalada-mixta|Ensalada mixta (lechuga, tomate, cebolla)|veg|20,1,4,0.2|1 plato:200|1/2 plato:100|
verduras-cocidas|Verduras cocidas / al vapor|veg|35,2,7,0.3|1 porción:200||
palta|Palta|grasa|160,2,8.5,15|1/2 palta:75|1 palta:150|aguacate
aceitunas|Aceitunas|grasa|145,1,3.8,15|5 aceitunas:20||
banana|Banana|fruta|89,1.1,23,0.3|1 banana:120||platano
manzana|Manzana|fruta|52,0.3,14,0.2|1 manzana:180||
naranja|Naranja|fruta|47,0.9,12,0.1|1 naranja:180||
mandarina|Mandarina|fruta|53,0.8,13,0.3|1 mandarina:100|2 mandarinas:200|
pera|Pera|fruta|57,0.4,15,0.1|1 pera:180||
frutilla|Frutillas|fruta|32,0.7,7.7,0.3|1 taza:150||fresas
durazno|Durazno|fruta|39,0.9,10,0.3|1 durazno:150||melocoton
uva|Uvas|fruta|69,0.7,18,0.2|1 taza:150||
kiwi|Kiwi|fruta|61,1.1,15,0.5|1 kiwi:75|2 kiwis:150|
anana|Ananá|fruta|50,0.5,13,0.1|1 rodaja:100||piña
sandia|Sandía|fruta|30,0.6,7.6,0.2|1 tajada:300||
melon|Melón|fruta|34,0.8,8,0.2|1 tajada:200||
ciruela|Ciruela|fruta|46,0.7,11,0.3|1 ciruela:70|2 ciruelas:140|
frutos-rojos|Frutos rojos|fruta|50,0.8,12,0.3|1 taza:140|1/2 taza:70|arandanos frambuesas
pomelo|Pomelo|fruta|42,0.8,11,0.1|1/2 pomelo:150||
mango|Mango|fruta|60,0.8,15,0.4|1 mango:200||
pasas|Pasas de uva|fruta|300,3,79,0.5|1 cda:15||
jugo-naranja|Jugo de naranja exprimido|fruta|45,0.7,10,0.2|1 vaso:200||
aceite-oliva|Aceite de oliva|grasa|884,0,0,100|1 cda:13|1 cdita:5|
aceite-girasol|Aceite de girasol / mezcla|grasa|884,0,0,100|1 cda:13|1 cdita:5|
mayonesa|Mayonesa|grasa|680,1,1,75|1 cda:15|1 cdita:5|
mayonesa-light|Mayonesa light|grasa|300,1,7,30|1 cda:15||
mani|Maní (sin sal)|grasa|570,26,16,49|20 maníes:20|1 puñado:30|cacahuate
pasta-mani|Pasta de maní|grasa|590,25,20,50|1 cda:16|1 cdita:6|mantequilla de mani
nueces|Nueces|grasa|654,15,14,65|10 mitades:20|1 puñado:30|
almendras|Almendras|grasa|580,21,22,50|10 almendras:12|1 puñado:30|
castanas-caju|Castañas de cajú|grasa|553,18,30,44|1 puñado:30||caju
pistachos|Pistachos|grasa|560,20,28,45|20 pistachos:15|1 puñado:30|
chia|Semillas de chía|grasa|486,17,42,31|1 cda:12||semillas
lino|Semillas de lino|grasa|534,18,29,42|1 cda:10||semillas
girasol-semillas|Semillas de girasol|grasa|584,21,20,51|1 cda:10||semillas
coco|Coco rallado|grasa|660,7,24,64|1 cda:7|2 cdas:14|
azucar|Azúcar|otro|400,0,100,0|1 cdita:5|1 sobre:6|
miel|Miel|otro|304,0.3,82,0|1 cda:20|1 cdita:7|
mermelada|Mermelada|otro|250,0.4,62,0.1|1 cda:20||dulce
mermelada-light|Mermelada light|otro|120,0.4,30,0|1 cda:20||dulce
membrillo|Dulce de membrillo / batata|otro|270,0.3,67,0.1|1 porción:40||
alfajor|Alfajor de chocolate|otro|430,5,62,18|1 alfajor:55||havanna jorgito
alfajor-maicena|Alfajor de maicena|otro|430,5,63,17|1 alfajor:50||
chocolate|Chocolate con leche|otro|535,7.6,59,30|1 barrita chica:25|1 tableta:100|
chocolate-amargo|Chocolate amargo 70%|otro|600,8,46,43|2 cuadraditos:20||
galletitas-dulces|Galletitas dulces / rellenas|otro|470,5,70,19|3 galletitas:30||oreo
barrita-cereal|Barrita de cereal|otro|380,6,70,9|1 barrita:23||
barrita-proteica|Barrita proteica|prot|360,30,35,12|1 barrita:45||
pastafrola|Pastafrola|otro|400,5,60,16|1 porción:80||
flan|Flan con dulce de leche|otro|170,5,26,5|1 porción:130||
arroz-leche|Arroz con leche|otro|125,3.5,22,2.6|1 porción:180||
bizcochuelo|Torta / bizcochuelo|otro|350,6,55,12|1 porción:70||
chocotorta|Chocotorta|otro|400,5,45,22|1 porción:120||
churros|Churros|otro|420,5,47,23|1 churro:40||
papas-paquete|Papas fritas de paquete|otro|536,7,53,35|1 bolsita:40||snack
gaseosa|Gaseosa|otro|42,0,10.6,0|1 vaso:250|1 lata:354|coca
gaseosa-light|Gaseosa light / zero|otro|0.5,0,0,0|1 vaso:250|1 lata:354|coca
cerveza|Cerveza|otro|43,0.5,3.6,0|1 lata:473|1 vaso:350|birra
vino|Vino tinto|otro|85,0.1,2.6,0|1 copa:150||
fernet|Fernet con cola|otro|75,0,9,0|1 vaso:300||
cafe-leche|Café con leche|otro|40,2,4,1.6|1 taza:250||
chocolatada|Leche chocolatada|otro|80,3,12,2|1 vaso:200||
isotonica|Bebida isotónica|otro|25,0,6,0|1 botella:500||gatorade powerade
mate|Mate / café / té (sin azúcar)|otro|2,0,0.3,0|1 taza o termo:250||infusion
`;

export const FOOD_CATS = [
  ['prot', 'Proteínas'], ['hc', 'Hidratos'], ['veg', 'Verduras'], ['fruta', 'Frutas'],
  ['grasa', 'Grasas'], ['mix', 'Comidas'], ['otro', 'Otros'],
];

// { id, name, cat, k: [kcal, p, c, f] cada 100 g, portions: [[etiqueta, gramos]], terms }
export const FOODS = RAW.trim().split('\n').map(line => {
  const [id, name, cat, k, ...rest] = line.split('|');
  const aliases = rest.pop() || '';
  return {
    id, name, cat,
    k: k.split(',').map(Number),
    portions: rest.filter(Boolean).map(p => { const i = p.lastIndexOf(':'); return [p.slice(0, i), Number(p.slice(i + 1))]; }),
    terms: norm(`${name} ${aliases}`),
  };
});

export function norm(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// ---------- Alimentos propios y registros ----------

export const allFoods = () => [...state.foods.custom, ...FOODS];
export const findFood = id => state.foods.custom.find(f => f.id === id) || FOODS.find(f => f.id === id);

// Nutrientes de una cantidad en gramos: { kcal, p, c, f }.
export function nutrients(food, grams) {
  const r = grams / 100;
  return { kcal: food.k[0] * r, p: food.k[1] * r, c: food.k[2] * r, f: food.k[3] * r };
}

// Un alimento registrado en una comida: { id, q (cantidad de porciones), pi (índice de porción), name }.
// Si el alimento ya no existe (por ejemplo, uno propio que se borró), se muestra con el nombre guardado.
export function entryInfo(e) {
  const food = findFood(e.id);
  if (!food) return { name: e.name || 'Alimento', label: '', grams: 0, n: null, cat: null };
  const [pl, g] = food.portions[e.pi] || food.portions[0];
  const grams = g * e.q;
  const label = e.q === 1 ? pl : `${num(e.q)} × ${pl}`;
  return { food, name: food.name, label, grams, n: nutrients(food, grams), cat: food.cat };
}

// Búsqueda: todas las palabras tienen que aparecer; primero los que empiezan con la búsqueda.
export function searchFoods(q) {
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const first = norm(q).trim();
  return allFoods()
    .filter(f => words.every(w => f.terms.includes(w)))
    .sort((a, b) => (norm(b.name).startsWith(first) - norm(a.name).startsWith(first)) || a.name.localeCompare(b.name));
}
