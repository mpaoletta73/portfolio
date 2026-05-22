import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import scrollama from 'https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm';

// ─── Step 1.1: Load & convert data ───────────────────────────────────────────

async function loadData() {
	const data = await d3.csv('loc.csv', (row) => ({
		...row,
		line: Number(row.line),
		depth: Number(row.depth),
		length: Number(row.length),
		date: new Date(row.date + 'T00:00' + row.timezone),
		datetime: new Date(row.datetime),
	}));
	return data;
}

// ─── Step 1.2: Process commits ───────────────────────────────────────────────

function processCommits(data) {
	return d3
		.groups(data, (d) => d.commit)
		.map(([commit, lines]) => {
			let first = lines[0];
			let { author, date, time, timezone, datetime } = first;
			let ret = {
				id: commit,
				url: 'https://github.com/mpaoletta73/portfolio/commit/' + commit,
				author,
				date,
				time,
				timezone,
				datetime,
				hourFrac: datetime.getHours() + datetime.getMinutes() / 60,
				totalLines: lines.length,
			};

			Object.defineProperty(ret, 'lines', {
				value: lines,
				enumerable: false,
				configurable: true,
				writable: true,
			});

			return ret;
		})
		.sort((a, b) => a.datetime - b.datetime);
}

// ─── Step 1.3: Render summary stats ──────────────────────────────────────────

function renderCommitInfo(data, commits) {
	const dl = d3.select('#stats').append('dl').attr('class', 'stats');

	// Total LOC
	dl.append('dt').html('Total <abbr title="Lines of code">LOC</abbr>');
	dl.append('dd').text(data.length);

	// Total commits
	dl.append('dt').text('Total commits');
	dl.append('dd').text(commits.length);

	// Number of files
	const numFiles = d3.group(data, (d) => d.file).size;
	dl.append('dt').text('Files');
	dl.append('dd').text(numFiles);

	// Max file length
	const fileLengths = d3.rollups(data, (v) => d3.max(v, (v) => v.line), (d) => d.file);
	const maxFileLength = d3.max(fileLengths, (d) => d[1]);
	dl.append('dt').text('Longest file (lines)');
	dl.append('dd').text(maxFileLength);

	// Average line length
	const avgLineLength = Math.round(d3.mean(data, (d) => d.length));
	dl.append('dt').text('Avg line length');
	dl.append('dd').text(avgLineLength + ' chars');

	// Day with most work
	const workByDay = d3.rollups(
		data,
		(v) => v.length,
		(d) => new Date(d.datetime).toLocaleString('en', { weekday: 'long' }),
	);
	const busiestDay = d3.greatest(workByDay, (d) => d[1])?.[0];
	dl.append('dt').text('Busiest day');
	dl.append('dd').text(busiestDay);
}

// ─── Steps 2–5: Scatter plot with tooltip and brush ──────────────────────────

// These scales live in module scope so brushed() can access them
let xScale, yScale;

function renderScatterPlot(data, commits) {
	const width = 1000;
	const height = 600;
	const margin = { top: 10, right: 10, bottom: 30, left: 20 };

	const usableArea = {
		top: margin.top,
		right: width - margin.right,
		bottom: height - margin.bottom,
		left: margin.left,
		width: width - margin.left - margin.right,
		height: height - margin.top - margin.bottom,
	};

	// Step 2.1: Scales
	xScale = d3
		.scaleTime()
		.domain(d3.extent(commits, (d) => d.datetime))
		.range([usableArea.left, usableArea.right])
		.nice();

	yScale = d3
		.scaleLinear()
		.domain([0, 24])
		.range([usableArea.bottom, usableArea.top]);

	const svg = d3
		.select('#chart')
		.append('svg')
		.attr('viewBox', `0 0 ${width} ${height}`)
		.style('overflow', 'visible');

	// Step 2.3: Gridlines (before axes so they render beneath)
	svg
		.append('g')
		.attr('class', 'gridlines')
		.attr('transform', `translate(${usableArea.left}, 0)`)
		.call(
			d3.axisLeft(yScale)
				.tickFormat('')
				.tickSize(-usableArea.width),
		);

	// Step 2.2: Axes
	svg
		.append('g')
		.attr('transform', `translate(0, ${usableArea.bottom})`)
		.attr('class', 'x-axis')
		.call(d3.axisBottom(xScale));

	svg
		.append('g')
		.attr('transform', `translate(${usableArea.left}, 0)`)
		.attr('class', 'y-axis')
		.call(
			d3.axisLeft(yScale)
				.tickFormat((d) => String(d % 24).padStart(2, '0') + ':00'),
		);

	// Step 4.1/4.2: Radius scale (sqrt for correct area perception)
	const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
	const rScale = d3.scaleSqrt().domain([minLines, maxLines]).range([2, 30]);

	// Step 4.3: Sort so larger dots are behind smaller ones
	const sortedCommits = d3.sort(commits, (d) => -d.totalLines);

	// Step 2.1 + 3.3 + 4.1: Dots
	const dots = svg.append('g').attr('class', 'dots');

	dots
		.selectAll('circle')
		.data(sortedCommits, (d) => d.id)
		.join('circle')
		.attr('cx', (d) => xScale(d.datetime))
		.attr('cy', (d) => yScale(d.hourFrac))
		.attr('r', (d) => rScale(d.totalLines))
		.attr('fill', 'steelblue')
		.style('fill-opacity', 0.7)
		.on('mouseenter', (event, commit) => {
			d3.select(event.currentTarget).style('fill-opacity', 1);
			renderTooltipContent(commit);
			updateTooltipVisibility(true);
			updateTooltipPosition(event);
		})
		.on('mouseleave', (event) => {
			d3.select(event.currentTarget).style('fill-opacity', 0.7);
			updateTooltipVisibility(false);
		});

	// Step 5.1: Brush
	svg.call(d3.brush().on('start brush end', brushed));

	// Step 5.2: Raise dots (and everything after the overlay) above the brush overlay
	svg.selectAll('.dots, .overlay ~ *').raise();
}

// ─── Lab 8 Step 1.3: Update scatter plot without recreating SVG ─────────────

function updateScatterPlot(data, commits) {
	const width = 1000;
	const height = 600;
	const margin = { top: 10, right: 10, bottom: 30, left: 20 };
	const usableArea = {
		top: margin.top,
		right: width - margin.right,
		bottom: height - margin.bottom,
		left: margin.left,
		width: width - margin.left - margin.right,
		height: height - margin.top - margin.bottom,
	};

	const svg = d3.select('#chart').select('svg');

	xScale = xScale.domain(d3.extent(commits, (d) => d.datetime));

	const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
	const rScale = d3.scaleSqrt().domain([minLines, maxLines]).range([2, 30]);

	const xAxis = d3.axisBottom(xScale);
	const xAxisGroup = svg.select('g.x-axis');
	xAxisGroup.selectAll('*').remove();
	xAxisGroup.call(xAxis);

	const dots = svg.select('g.dots');
	const sortedCommits = d3.sort(commits, (d) => -d.totalLines);

	dots
		.selectAll('circle')
		.data(sortedCommits, (d) => d.id)
		.join('circle')
		.attr('cx', (d) => xScale(d.datetime))
		.attr('cy', (d) => yScale(d.hourFrac))
		.attr('r', (d) => rScale(d.totalLines))
		.attr('fill', 'steelblue')
		.style('fill-opacity', 0.7)
		.on('mouseenter', (event, commit) => {
			d3.select(event.currentTarget).style('fill-opacity', 1);
			renderTooltipContent(commit);
			updateTooltipVisibility(true);
			updateTooltipPosition(event);
		})
		.on('mouseleave', (event) => {
			d3.select(event.currentTarget).style('fill-opacity', 0.7);
			updateTooltipVisibility(false);
		});
}

// ─── Lab 8 Step 2: File unit visualization ────────────────────────────────────

const colors = d3.scaleOrdinal(d3.schemeTableau10);

function updateFileDisplay(filteredCommits) {
	let lines = filteredCommits.flatMap((d) => d.lines);
	let files = d3
		.groups(lines, (d) => d.file)
		.map(([name, lines]) => ({ name, lines }))
		.sort((a, b) => b.lines.length - a.lines.length);

	let filesContainer = d3
		.select('#files')
		.selectAll('div')
		.data(files, (d) => d.name)
		.join(
			(enter) =>
				enter.append('div').call((div) => {
					div.append('dt').append('code');
					div.append('dd');
				}),
		);

	filesContainer
		.select('dt > code')
		.html((d) => `${d.name}<small>${d.lines.length} lines</small>`);

	filesContainer
		.select('dd')
		.selectAll('div')
		.data((d) => d.lines)
		.join('div')
		.attr('class', 'loc')
		.attr('style', (d) => `--color: ${colors(d.type)}`);
}

// ─── Step 3: Tooltip helpers ─────────────────────────────────────────────────

function renderTooltipContent(commit) {
	if (Object.keys(commit).length === 0) return;

	document.getElementById('commit-link').href = commit.url;
	document.getElementById('commit-link').textContent = commit.id;
	document.getElementById('commit-date').textContent = commit.datetime?.toLocaleString('en', { dateStyle: 'full' });
	document.getElementById('commit-time').textContent = commit.time;
	document.getElementById('commit-author').textContent = commit.author;
	document.getElementById('commit-lines').textContent = commit.totalLines;
}

function updateTooltipVisibility(isVisible) {
	document.getElementById('commit-tooltip').hidden = !isVisible;
}

function updateTooltipPosition(event) {
	const tooltip = document.getElementById('commit-tooltip');
	tooltip.style.left = `${event.clientX}px`;
	tooltip.style.top = `${event.clientY}px`;
}

// ─── Step 5.4: Brush selection ───────────────────────────────────────────────

function isCommitSelected(selection, commit) {
	if (!selection) return false;
	const [[x0, y0], [x1, y1]] = selection;
	const cx = xScale(commit.datetime);
	const cy = yScale(commit.hourFrac);
	return cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1;
}

function brushed(event) {
	const selection = event.selection;
	d3.selectAll('circle').classed('selected', (d) => isCommitSelected(selection, d));
	renderSelectionCount(selection);
	renderLanguageBreakdown(selection);
}

// ─── Step 5.5: Selection count ───────────────────────────────────────────────

function renderSelectionCount(selection) {
	const selectedCommits = selection
		? commits.filter((d) => isCommitSelected(selection, d))
		: [];
	document.querySelector('#selection-count').textContent =
		`${selectedCommits.length || 'No'} commits selected`;
	return selectedCommits;
}

// ─── Step 5.6: Language breakdown ────────────────────────────────────────────

function renderLanguageBreakdown(selection) {
	const selectedCommits = selection
		? commits.filter((d) => isCommitSelected(selection, d))
		: [];
	const container = document.getElementById('language-breakdown');

	if (selectedCommits.length === 0) {
		container.innerHTML = '';
		return;
	}

	const requiredCommits = selectedCommits.length ? selectedCommits : commits;
	const lines = requiredCommits.flatMap((d) => d.lines);

	const breakdown = d3.rollup(lines, (v) => v.length, (d) => d.type);

	container.innerHTML = '';
	for (const [language, count] of breakdown) {
		const proportion = count / lines.length;
		const formatted = d3.format('.1~%')(proportion);
		container.innerHTML += `<dt>${language}</dt><dd>${count} lines (${formatted})</dd>`;
	}
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

let data = await loadData();
let commits = processCommits(data);

// Lab 8 Step 1.1: time scale for progress filtering
let commitProgress = 100;
let timeScale = d3
	.scaleTime()
	.domain([d3.min(commits, (d) => d.datetime), d3.max(commits, (d) => d.datetime)])
	.range([0, 100]);
let commitMaxTime = timeScale.invert(commitProgress);
let filteredCommits = commits;

renderCommitInfo(data, commits);
renderScatterPlot(data, commits);
updateFileDisplay(commits);

// Lab 8 Step 3.2: Narrative steps for scatter plot scrollytelling
d3.select('#scatter-story')
	.selectAll('.step')
	.data(commits)
	.join('div')
	.attr('class', 'step')
	.html(
		(d, i) => `
		On ${d.datetime.toLocaleString('en', { dateStyle: 'full', timeStyle: 'short' })},
		I made <a href="${d.url}" target="_blank">${
			i > 0 ? 'another glorious commit' : 'my first commit, and it was glorious'
		}</a>.
		I edited ${d.totalLines} lines across ${
			d3.rollups(d.lines, (D) => D.length, (d) => d.file).length
		} files.
		Then I looked over all I had made, and I saw that it was very good.
	`,
	);

// Lab 8 Step 4: Narrative steps for file unit viz scrollytelling
d3.select('#file-story')
	.selectAll('.step')
	.data(commits)
	.join('div')
	.attr('class', 'step')
	.html(
		(d, i) => `
		On ${d.datetime.toLocaleString('en', { dateStyle: 'full', timeStyle: 'short' })},
		I made <a href="${d.url}" target="_blank">${
			i > 0 ? 'another glorious commit' : 'my first commit, and it was glorious'
		}</a>.
		I edited ${d.totalLines} lines across ${
			d3.rollups(d.lines, (D) => D.length, (d) => d.file).length
		} files.
		Then I looked over all I had made, and I saw that it was very good.
	`,
	);

// Lab 8 Step 3.3: Scrollama — commits scatter plot
function onStepEnter(response) {
	const commit = response.element.__data__;
	filteredCommits = commits.filter((d) => d.datetime <= commit.datetime);
	updateScatterPlot(data, filteredCommits);
	updateFileDisplay(filteredCommits);
}

const scroller = scrollama();
scroller
	.setup({ container: '#scrolly-1', step: '#scrolly-1 .step' })
	.onStepEnter(onStepEnter);

// Lab 8 Step 4: Scrollama — file unit visualization
function onFileStepEnter(response) {
	const commit = response.element.__data__;
	filteredCommits = commits.filter((d) => d.datetime <= commit.datetime);
	updateFileDisplay(filteredCommits);
}

const fileScroller = scrollama();
fileScroller
	.setup({ container: '#scrolly-2', step: '#scrolly-2 .step' })
	.onStepEnter(onFileStepEnter);
