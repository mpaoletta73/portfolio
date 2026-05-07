import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

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
		});
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
		.call(d3.axisBottom(xScale));

	svg
		.append('g')
		.attr('transform', `translate(${usableArea.left}, 0)`)
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
		.data(sortedCommits)
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

renderCommitInfo(data, commits);
renderScatterPlot(data, commits);
