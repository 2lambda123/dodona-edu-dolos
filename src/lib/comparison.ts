import assert from "assert";
import { HashFilter } from "./hashFilter";
import { Intersection } from "./intersection";
import { Match } from "./match";
import { Options } from "./options";
import { Selection } from "./selection";
import { Tokenizer } from "./tokenizer";
import { WinnowFilter } from "./winnowFilter";
import { DefaultMap } from "./defaultMap";
import { File } from "./file";

type Hash = number;
export type Analysis = Array<Intersection>;

interface FilePart {
  file: File;
  kmer: number;
  location: Selection;
  data: string;
}

export class Comparison {
  private readonly kmerLength: number;
  private readonly kmersInWindow: number;
  private readonly index: Map<Hash, Array<FilePart>> = new Map();
  private readonly tokenizer: Tokenizer<Selection>;
  private readonly hashFilter: HashFilter;

  /**
   * Creates a Comparison object with a given Tokenizer , an optional Options
   * object, and an optional HashFilter.
   *
   * If no HashFilter is given, a new WinnowFilter is created with values geven
   * by the Options (or the default Options).
   *
   * After creation, first add files to the index which can then be queried.
   *
   * @param tokenizer A tokenizer for the correct programming language
   * @param hashFilter An optional HashFilter to filter the hashes returned by
   * the rolling hash function.
   */
  constructor(
    tokenizer: Tokenizer<Selection>,
    options: Options = new Options(),
    hashFilter?: HashFilter
  ) {
    this.tokenizer = tokenizer;
    this.kmerLength = options.kmerLength;
    this.kmersInWindow = options.kmersInWindow;
    this.hashFilter =
      hashFilter
        ? hashFilter
        : new WinnowFilter(this.kmerLength, this.kmersInWindow);
  }

  /**
   * Compare a list of files with each other and the files already stored in the
   * index. The compared files are also added to the index.
   *
   * @param files: the file objects which need to be compared to the index
   * and each other. The file hashes will be added to the index.
   * @param hashFilter: an optional HashFilter. By default the HashFilter of the
   * Comparison object will be used.
   * @return an Analysis object, which is a list of Intersections
   * (containing all the matches between two files).
   */
  public async compareFiles(
    files: File[],
    hashFilter = this.hashFilter
  ): Promise<Analysis> {

    // to keep track of which two files match (and not have two times the same
    // Intersection but in different order), we use a nested map where we use
    // the two keys in lexicographical order
    const intersections: DefaultMap<File, Map<File, Intersection>> =
      new DefaultMap(() => new Map())

    for (const file of files) {

      const [ast, mapping] =
        this.tokenizer.tokenizeFileWithMapping(file);

      let kmer = 0;
      for await (
        const fullHash
        of hashFilter.hashesFromString(ast)
      ) {
        const { data, hash, start, stop } = fullHash;

        // sanity check
        assert(
          Selection.isInOrder(mapping[start], mapping[stop]),
          `Invallid ordering:
            expected ${mapping[start]}
            to start be before the end of ${mapping[stop]}`
        );

        const location = Selection.merge(mapping[start], mapping[stop]);
        const part: FilePart = {
          kmer,
          file,
          data,
          location,
        };

        // look if the index already contains the given hash
        const matches = this.index.get(hash);

        if (matches) {
          // the hash exists in out index, look which files we've matched
          for (const match of matches) {

            // don't add a match if we've matched ourselves
            if(match.file === file) {
              continue;
            }

            // find or create an Intersection object with the matched file
            const [first, second] = [match.file, file].sort(File.compare);
            let intersection = intersections.get(first).get(second);
            if (!intersection) {
              intersection = new Intersection(file, match.file);
              intersections.get(first).set(second, intersection);
            }

            // add the new match to the intersection object
            intersection.addMatch(
              new Match(
                kmer,
                location,
                data,
                match.kmer,
                match.location,
                match.data,
                hash
              )
            );
          }

          // finally, add our matching part to the index
          matches.push(part);
        } else {

          // if the hash does not yet exist in the index, add it
          this.index.set(hash, [part]);
        }

        kmer += 1;
      }
    }

    return Array.of(...intersections.values())
      .map(m => Array.of(...m.values()))
      .flat();
  }

  /**
   * Compare a file to the index. A map will be returned containing the filename
   * of the matching file, along with a list of matching position between the
   * two files.
   *
   * @param file The file to query
   * @param hashFilter An optional HashFilter. By default the HashFilter of the
   * Comparison object will be used.
   * @return a promise of a list of Intersection objects. An Intersection object
   * represents the common hashes (matches) between two files.
   */
  public async compareFile(
    file: File,
    hashFilter = this.hashFilter
  ): Promise<Analysis> {
    return this.compareFiles([file], hashFilter);
  }
}
