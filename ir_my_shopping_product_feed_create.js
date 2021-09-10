/**
 *@NApiVersion 2.1
 *@NScriptType ScheduledScript
 *@NModuleScope Public
 *@NAmdConfig ./LibraryConfig.json
 */
define(['N/search', 'N/record', 'N/email', 'N/runtime', 'N/file', 'N/log'], function (search, record, email, runtime, file, log) {
	function execute(context) {
		try {
			const searchObj = search.load({
				id: 240,
			});
			const columns = searchObj.columns;
			const pagedSearch = searchObj.runPaged({ pageSize: 1000 });
			const pagedSearchCount = pagedSearch.pageRanges;
			const pageLength = pagedSearchCount.length;
			const resultsArray = new Array();
			const csvFile = file.create({
				name: 'myshopping-feed.xml',
				folder: 5362175,
				fileType: 'XMLDOC',
				isOnline: true,
			});
			let count = 0;
			let label = null;

			for (let x = 0; x < pageLength; x++) {
				const pagedSearchData = pagedSearch.fetch({ index: x }).data;

				pagedSearchData.forEach(function (result) {
					resultsArray.push({ id: result.id });

					for (var i = 0; i < columns.length; i++) {
						label = columns[i]['label'];

						if (label.indexOf('.text') == -1) {
							resultsArray[count][label] = result.getValue(columns[i]);
						} else {
							label = label.replace('.text', '');

							if (result.getValue(columns[i]) != '') {
								resultsArray[count][label] = result.getText(columns[i]);
							} else {
								resultsArray[count][label] = '';
							}
						}
					}

					count++;
					return true;
				});
			}

			csvFile.appendLine({
				value: `<?xml version="1.0" encoding="ISO-8859-1"?>\n<products>`,
			});

			for (let i = 0; i < count - 1; i++) {
				const productURL = `https://www.latestbuy.com.au/${resultsArray[i]['Woocommerce URL']}/?partner=245133524&affid=245133524&amp;utm_source=prodFeed3&amp;utm_medium=xml&amp;utm_campaign=prodFeed_my_shopping&utm_term=${resultsArray[i]['Name']}`;
				const imageURL = `http://www.latestbuy.com.au/${resultsArray[i]['250a']}`;
				const inStock = isNaN(parseInt(resultsArray[i]['Available'])) && parseInt(resultsArray[i]['Available']) > 0 ? 'N' : 'Y';

				let xmlContent = '';
				xmlContent += `<item>\n`;
				xmlContent += `<price>${resultsArray[i]['Online Price']}</price>\n`;
				xmlContent += `<name><![CDATA[${resultsArray[i]['Display Name']}]]></name>\n`;
				xmlContent += `<code><![CDATA[${resultsArray[i]['Name']}]]></code>\n`;
				xmlContent += `<description></description>\n`;
				xmlContent += `<product_url><![CDATA[${productURL}]]></product_url>\n`;
				xmlContent += `<category><![CDATA[${resultsArray[i]['Category']}]]></category>\n`;
				xmlContent += `<image_url><![CDATA[${imageURL}]]></image_url>\n`;
				xmlContent += `<shipping>${resultsArray[i]['ShippingRate']}</shipping>\n`;
				xmlContent += `<brand><![CDATA[${resultsArray[i]['Manufacturer']}]]></brand>\n`;
				xmlContent += `<instock>${inStock}</instock>\n`;
				xmlContent += `</item>`;

				csvFile.appendLine({
					value: xmlContent,
				});
			}

			csvFile.appendLine({
				value: `</products>`,
			});

			csvFile.save();
			return resultsArray;
		} catch (e) {
			// Error
			log.error('e', e);
		}
	}

	return {
		execute: execute,
	};
});
